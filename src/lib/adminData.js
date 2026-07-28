import { getRedis } from "./redis.js";
import {
  IDX_ACCOUNTS,
  IDX_EXAMS,
  IDX_LAST_SEEN,
  IDX_PLAYS,
  IDX_TXNS,
  countAll,
  countBetween,
  idsBetween,
  playKey,
} from "./indexes.js";
import * as S from "./adminStats.js";
import { aggregateStats } from "./analytics.js";

// Couche DONNÉES du pilotage : lit les index globaux + les documents, puis
// délègue tout le calcul aux fonctions pures d'adminStats.js. Le seul endroit
// où le tableau de bord touche Redis.
//
// Ces builders de clés reflètent les versions privées de accounts/history/
// payments : on ne peut pas passer par leurs lecteurs (getExamRecord vérifie
// l'appartenance au compte, inadapté à une lecture globale d'admin).
const accountKey = (id) => `account:${id}`;
const examKey = (id) => `examRecord:${id}`;
const txnKey = (id) => `txn:${id}`;

const DAY_MS = 86400000;
// Plafond de sécurité : à l'échelle actuelle du produit, tout tient largement
// dessous. Au-delà, il faudra des compteurs agrégés (cf. TODO modèle données)
// plutôt que de relire chaque document.
const MAX = 5000;

async function loadDocs(ids, keyFn) {
  const valid = (ids || []).filter(Boolean);
  if (!valid.length) return [];
  const redis = getRedis();
  const out = [];
  for (let i = 0; i < valid.length; i += 100) {
    const chunk = valid.slice(i, i + 100);
    const docs = await redis.mget(...chunk.map(keyFn));
    for (const d of docs || []) if (d) out.push(d);
  }
  return out;
}

const loadAccounts = () =>
  idsBetween(IDX_ACCOUNTS, 0, Date.now(), MAX).then((ids) => loadDocs(ids, accountKey));

const loadExamsSince = (from, now) =>
  idsBetween(IDX_EXAMS, from, now, MAX).then((ids) => loadDocs(ids, examKey));

const loadTxnsSince = (from, now) =>
  idsBetween(IDX_TXNS, from, now, MAX).then((ids) => loadDocs(ids, txnKey));

const loadPlaysSince = (from, now) =>
  idsBetween(IDX_PLAYS, from, now, MAX).then((ids) => loadDocs(ids, playKey));

/**
 * Vue d'ensemble du tableau de bord.
 *
 * Distingue deux natures de chiffres, à ne jamais mélanger dans une même
 * lecture :
 *   • STOCK (tout l'historique) : comptes inscrits, passif prépayé — ce qui
 *     existe à l'instant T ;
 *   • FLUX (sur la fenêtre `days`) : revenus, examens, entonnoir — ce qui
 *     s'est passé sur la période.
 * `days` borne aussi le churn (fenêtre précédente vs courante).
 */
export async function overviewData({ now = Date.now(), days = 30 } = {}) {
  const from = now - days * DAY_MS;
  const prevStart = now - 2 * days * DAY_MS;
  const range = { from, to: now };

  // Chargements en parallèle. Les examens/txns sont lus sur DEUX fenêtres
  // (courante + précédente) pour le churn, d'où le départ à `prevStart`.
  const [accounts, exams2w, txns, plays, totalAccounts, actifs30j] = await Promise.all([
    loadAccounts(),
    loadExamsSince(prevStart, now),
    loadTxnsSince(from, now),
    loadPlaysSince(from, now),
    countAll(IDX_ACCOUNTS),
    countBetween(IDX_LAST_SEEN, now - 30 * DAY_MS, now),
  ]);

  // Examens de la seule fenêtre courante, pour les flux (le churn utilise les
  // deux fenêtres via exams2w).
  const exams = exams2w.filter((e) => Number(e.endedAt) >= from);
  const arpu = S.arpuPayant(txns);
  const base = aggregateStats(exams); // examCount, totalParticipants, totalSpentAr, avgNote

  return {
    generatedAt: now,
    days,
    stock: {
      comptesInscrits: totalAccounts,
      passifPrepaidAr: S.prepaidLiability(accounts),
      providerMix: S.providerMix(accounts),
      actifs30j,
    },
    revenu: {
      encaisseAr: S.encaisseTotal(txns),
      consommeAr: S.consommeTotal(exams),
      arpuPayantAr: arpu.arpuAr,
      clientsPayants: arpu.payeurs,
      panierMoyenAr: S.panierMoyenExamen(exams),
      encaisseSeries: S.encaisseSeries(txns, range),
      consommeSeries: S.consommeSeries(exams, range),
    },
    usage: {
      examens: base.examCount,
      participants: base.totalParticipants,
      noteMoyenne: base.avgNote,
      funnel: S.funnel(plays),
      capacityMix: S.capacityMix(exams),
      examensSeries: S.dailySeries(exams, { ...range, ts: (e) => e.endedAt }),
      inscriptionsSeries: S.signupsSeries(accounts, range),
    },
    churn: S.usageChurn(exams2w, { prevStart, curStart: from, now }),
  };
}

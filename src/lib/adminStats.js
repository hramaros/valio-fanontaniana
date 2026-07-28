// Agrégations PURES du tableau de bord de pilotage (aucun I/O), testables
// avec `node --test`. La couche données (adminData.js) charge les documents
// via les index et passe des tableaux à ces fonctions.
//
// Modèle PRÉPAYÉ, pas d'abonnement : on distingue deux revenus qui ne
// coïncident pas dans le temps —
//   • encaissé  = recharges Stripe confirmées (l'argent entre) ;
//   • consommé  = examens réellement débités (le prépayé est utilisé).
// Le passif prépayé (soldes non dépensés) est la dette envers les clients.

import { TXN_COMPLETED } from "./payments.js";
import { MODE_EXAMEN, CAP_UNLIMITED, normalizeMode, normalizeCapacity } from "./exam.js";

const DAY_MS = 86400000;
// Madagascar = UTC+3, sans heure d'été : la « journée » d'un rapport suit
// l'heure locale, pas UTC. Paramétrable pour les tests.
export const EAT_OFFSET_MIN = 180;

/** Clé de jour « YYYY-MM-DD » dans le fuseau donné. */
export function dayKey(ts, tzOffsetMin = EAT_OFFSET_MIN) {
  return new Date(Number(ts) + tzOffsetMin * 60000).toISOString().slice(0, 10);
}

/**
 * Série journalière sur [from, to] (bornes incluses), trous comblés à 0 —
 * une courbe sans jours manquants. `ts` extrait l'horodatage d'un élément,
 * `value` la quantité à sommer (défaut : compter).
 */
export function dailySeries(items, { from, to, ts, value = () => 1, tzOffsetMin = EAT_OFFSET_MIN }) {
  const off = tzOffsetMin * 60000;
  const buckets = new Map();
  for (const it of items || []) {
    const t = Number(ts(it));
    if (!t || t < from || t > to) continue;
    const k = dayKey(t, tzOffsetMin);
    buckets.set(k, (buckets.get(k) || 0) + (Number(value(it)) || 0));
  }
  const startDay = Math.floor((from + off) / DAY_MS);
  const endDay = Math.floor((to + off) / DAY_MS);
  const out = [];
  for (let d = startDay; d <= endDay; d++) {
    const day = new Date(d * DAY_MS).toISOString().slice(0, 10);
    out.push({ day, value: buckets.get(day) || 0 });
  }
  return out;
}

// — Revenu —

/** Total encaissé : recharges confirmées uniquement (l'argent est entré). */
export function encaisseTotal(txns) {
  return (txns || []).reduce(
    (s, t) => s + (t.status === TXN_COMPLETED ? Number(t.amountAr) || 0 : 0),
    0,
  );
}

/** Total consommé : examens réellement débités (prépayé utilisé). */
export function consommeTotal(exams) {
  return (exams || []).reduce(
    (s, e) => s + (e.charged ? Number(e.priceAr) || 0 : 0),
    0,
  );
}

/** Passif prépayé : somme des soldes non consommés (dette envers les clients). */
export function prepaidLiability(accounts) {
  return (accounts || []).reduce((s, a) => s + (Number(a.balanceAr) || 0), 0);
}

export function encaisseSeries(txns, range) {
  return dailySeries((txns || []).filter((t) => t.status === TXN_COMPLETED), {
    ...range,
    ts: (t) => t.completedAt || t.createdAt,
    value: (t) => Number(t.amountAr) || 0,
  });
}

export function consommeSeries(exams, range) {
  return dailySeries((exams || []).filter((e) => e.charged), {
    ...range,
    ts: (e) => e.endedAt,
    value: (e) => Number(e.priceAr) || 0,
  });
}

// — Clients —

export function signupsSeries(accounts, range) {
  return dailySeries(accounts, { ...range, ts: (a) => a.createdAt });
}

/** Répartition par mode d'authentification (mot de passe vs Google). */
export function providerMix(accounts) {
  let password = 0;
  let google = 0;
  for (const a of accounts || []) {
    if (a.provider === "google") google++;
    else password++;
  }
  return { password, google };
}

/**
 * Revenu moyen par client PAYANT : encaissé rapporté au nombre de comptes
 * ayant au moins une recharge confirmée. Pas « par compte » : la plupart des
 * inscrits ne rechargent jamais, ce qui écraserait la moyenne.
 */
export function arpuPayant(txns) {
  const payeurs = new Set();
  let total = 0;
  for (const t of txns || []) {
    if (t.status !== TXN_COMPLETED) continue;
    total += Number(t.amountAr) || 0;
    if (t.accountId) payeurs.add(t.accountId);
  }
  const n = payeurs.size;
  return { total, payeurs: n, arpuAr: n ? Math.round(total / n) : 0 };
}

/** Panier moyen d'un examen débité (en Ariary). */
export function panierMoyenExamen(exams) {
  const debites = (exams || []).filter((e) => e.charged);
  if (!debites.length) return 0;
  const total = debites.reduce((s, e) => s + (Number(e.priceAr) || 0), 0);
  return Math.round(total / debites.length);
}

/**
 * Churn d'usage : comptes ayant lancé un examen dans la fenêtre PRÉCÉDENTE
 * [prevStart, curStart) mais aucun dans la fenêtre COURANTE [curStart, now].
 * Sur du prépayé sans abonnement, l'inactivité est le seul signal de perte.
 */
export function usageChurn(exams, { prevStart, curStart, now }) {
  const prev = new Set();
  const cur = new Set();
  for (const e of exams || []) {
    const t = Number(e.endedAt);
    if (!e.accountId || !t) continue;
    if (t >= prevStart && t < curStart) prev.add(e.accountId);
    if (t >= curStart && t <= now) cur.add(e.accountId);
  }
  let churned = 0;
  for (const a of prev) if (!cur.has(a)) churned++;
  return {
    actifsAvant: prev.size,
    retenus: prev.size - churned,
    perdus: churned,
    taux: prev.size ? Math.round((churned / prev.size) * 1000) / 1000 : 0,
  };
}

// — Usage —

/**
 * Entonnoir gratuit → payant, à partir des parties lancées (le mode Libre
 * n'existe dans aucune autre trace). Conversion = examens / total.
 */
export function funnel(plays) {
  let libre = 0;
  let examen = 0;
  for (const p of plays || []) {
    if (normalizeMode(p.mode) === MODE_EXAMEN) examen++;
    else libre++;
  }
  const total = libre + examen;
  return { libre, examen, total, conversion: total ? Math.round((examen / total) * 1000) / 1000 : 0 };
}

/** Mix des capacités d'examen (≤ 20 à 1 000 Ar vs illimité à 2 000 Ar). */
export function capacityMix(exams) {
  let small = 0;
  let unlimited = 0;
  for (const e of exams || []) {
    if (normalizeMode(e.mode) !== MODE_EXAMEN) continue;
    if (normalizeCapacity(e.capacity) === CAP_UNLIMITED) unlimited++;
    else small++;
  }
  return { small, unlimited };
}

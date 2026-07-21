import { getRedis } from "./redis.js";
import { IDX_ACCOUNTS, IDX_EXAMS, IDX_LAST_SEEN, IDX_TXNS } from "./indexes.js";

// Rattrapage des index globaux depuis les données déjà en base.
//
// Les index de `indexes.js` ne captent que ce qui s'écrit à partir de leur
// mise en service. Ce module reconstruit l'antériorité en parcourant les
// clés existantes — le seul endroit du projet où l'on se permet un SCAN,
// parce que c'est une tâche d'exploitation ponctuelle et jamais une requête
// web (un SCAN coûte un aller-retour HTTP par lot chez Upstash).
//
// Rétroactivité réelle :
//   comptes  → intégrale (`createdAt` a toujours été persisté)
//   examens  → intégrale (`endedAt` idem)
//   recharges→ partielle : les transactions de plus de 30 j ont été détruites
//              par un TTL depuis retiré. Ce qui a expiré est irrécupérable.
//
// Idempotent : ZADD écrase le score, le script peut être relancé sans risque.

const MGET_CHUNK = 100; // taille de lot de lecture
const ZADD_CHUNK = 100; // taille de lot d'écriture

/** Parcourt les clés d'un motif, par lots, jusqu'à épuisement du curseur. */
export async function* scanKeys(pattern, { count = 200 } = {}) {
  const redis = getRedis();
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, { match: pattern, count });
    cursor = String(next ?? "0");
    if (keys?.length) yield keys;
  } while (cursor !== "0");
}

async function readDocs(keys) {
  if (!keys.length) return [];
  const redis = getRedis();
  const out = [];
  for (let i = 0; i < keys.length; i += MGET_CHUNK) {
    const chunk = keys.slice(i, i + MGET_CHUNK);
    const docs = await redis.mget(...chunk);
    out.push(...(docs || []));
  }
  return out;
}

async function zaddChunked(key, pairs, { gt = false } = {}) {
  if (!pairs.length) return;
  const redis = getRedis();
  for (let i = 0; i < pairs.length; i += ZADD_CHUNK) {
    const chunk = pairs.slice(i, i + ZADD_CHUNK);
    if (gt) await redis.zadd(key, { gt: true }, ...chunk);
    else await redis.zadd(key, ...chunk);
  }
}

const emptyStat = () => ({ scanned: 0, indexed: 0, orphelins: 0, sansDate: 0 });

/**
 * Reconstruit un index à partir d'un motif de clés.
 * `pick(doc)` renvoie `{ member, score }`, ou `null` si le document est
 * inutilisable (clé orpheline : la valeur a expiré mais l'index qui la
 * référençait subsiste).
 */
async function rebuild({ pattern, indexKey, pick, dryRun, onDoc }) {
  const stat = emptyStat();
  const pairs = [];
  for await (const keys of scanKeys(pattern)) {
    stat.scanned += keys.length;
    for (const doc of await readDocs(keys)) {
      const picked = doc ? pick(doc) : null;
      if (!picked || !picked.member) {
        stat.orphelins++;
        continue;
      }
      // Une date absente ne doit pas faire disparaître l'entrée du total :
      // on l'indexe au score 0 et on la signale. Une requête de courbe bornée
      // à une période récente l'écarte naturellement.
      if (!picked.score) stat.sansDate++;
      pairs.push({ score: Number(picked.score) || 0, member: picked.member });
      stat.indexed++;
      onDoc?.(doc);
    }
  }
  if (!dryRun) await zaddChunked(indexKey, pairs);
  return stat;
}

/**
 * Rattrape les quatre index reconstructibles.
 * `dryRun` compte tout sans rien écrire — à privilégier pour un premier
 * passage sur des données de production.
 */
export async function backfillIndexes({ dryRun = false } = {}) {
  const report = { dryRun, accounts: null, exams: null, txns: null, lastSeen: 0 };

  report.accounts = await rebuild({
    pattern: "account:*", // ne matche pas `accountEmail:*` (deux-points)
    indexKey: IDX_ACCOUNTS,
    pick: (a) => ({ member: a.id, score: a.createdAt }),
    dryRun,
  });

  // Dernière activité connue par compte : à défaut d'historique de connexion
  // (les sessions expirent sans laisser de trace), le dernier examen archivé
  // est le meilleur signal disponible pour l'antériorité.
  const dernierExamen = new Map();
  report.exams = await rebuild({
    pattern: "examRecord:*",
    indexKey: IDX_EXAMS,
    pick: (r) => ({ member: r.id, score: r.endedAt }),
    dryRun,
    onDoc: (r) => {
      const at = Number(r.endedAt) || 0;
      if (!r.accountId || !at) return;
      if (at > (dernierExamen.get(r.accountId) || 0)) {
        dernierExamen.set(r.accountId, at);
      }
    },
  });

  report.txns = await rebuild({
    pattern: "txn:*", // ne matche pas `txnHistory:*`
    indexKey: IDX_TXNS,
    pick: (t) => ({ member: t.id, score: t.createdAt }),
    dryRun,
  });

  // `gt` : ne jamais faire régresser une activité plus récente déjà
  // enregistrée (une connexion d'aujourd'hui prime sur un examen d'il y a un
  // an), ce qui rend aussi ce rattrapage rejouable sans effet de bord.
  const pairs = [...dernierExamen.entries()].map(([member, score]) => ({
    member,
    score,
  }));
  if (!dryRun) await zaddChunked(IDX_LAST_SEEN, pairs, { gt: true });
  report.lastSeen = pairs.length;

  return report;
}

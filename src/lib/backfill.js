import { getRedis } from "./redis.js";
import { IDX_ACCOUNTS, IDX_EXAMS, IDX_LAST_SEEN, IDX_TXNS } from "./indexes.js";
import { examAcctKey, examClassKey } from "./history.js";
import { txnAcctKey } from "./payments.js";

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
//   examens  → intégrale (`endedAt` idem), index global ET index par compte
//              et par classe, reconstruits dans la même passe
//   recharges→ partielle : les transactions de plus de 30 j ont été détruites
//              par un TTL depuis retiré. Ce qui a expiré est irrécupérable.
//              Index global ET index par compte, même passe.
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
 * Écrit un paquet d'index scopés (une clé par compte / par classe).
 * Renvoie le nombre de clés et d'entrées, pour que le rapport dise ce qui a
 * été reconstruit et non seulement « c'est passé ».
 */
async function writeBuckets(bucket, keyOf, dryRun, { step, onProgress } = {}) {
  let entries = 0;
  let done = 0;
  for (const [scope, pairs] of bucket) {
    entries += pairs.length;
    if (!dryRun) await zaddChunked(keyOf(scope), pairs);
    done++;
    // Un ZADD par compte/classe : c'est ici que passe l'essentiel du temps
    // d'un `--write`. On rend compte tous les 25 pour ne pas noyer la sortie,
    // mais toujours au premier — sinon une étape de moins de 25 clés resterait
    // entièrement muette.
    if (done === 1 || done % 25 === 0) {
      onProgress?.({ step, kind: "write", count: done });
    }
  }
  return { keys: bucket.size, entries };
}

/**
 * Reconstruit un index à partir d'un motif de clés.
 * `pick(doc)` renvoie `{ member, score }`, ou `null` si le document est
 * inutilisable (clé orpheline : la valeur a expiré mais l'index qui la
 * référençait subsiste).
 */
async function rebuild({ pattern, indexKey, pick, dryRun, onDoc, step, onProgress }) {
  const stat = emptyStat();
  const pairs = [];
  for await (const keys of scanKeys(pattern)) {
    stat.scanned += keys.length;
    // Un aller-retour HTTP par lot : sans ce signal, un parcours de plusieurs
    // minutes est indistinguable d'un blocage réseau.
    onProgress?.({ step, kind: "scan", count: stat.scanned });
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
 *
 * `onProgress({ step, kind, count })` est appelé au fil du parcours
 * (`kind: "scan"`) et des écritures scopées (`kind: "write"`). Sans lui, un
 * rattrapage de plusieurs minutes n'affiche rien et devient indistinguable
 * d'un blocage réseau.
 */
export async function backfillIndexes({ dryRun = false, onProgress } = {}) {
  const report = {
    dryRun,
    accounts: null,
    exams: null,
    examsParCompte: null,
    examsParClasse: null,
    txns: null,
    txnsParCompte: null,
    lastSeen: 0,
  };

  report.accounts = await rebuild({
    pattern: "account:*", // ne matche pas `accountEmail:*` (deux-points)
    indexKey: IDX_ACCOUNTS,
    pick: (a) => ({ member: a.id, score: a.createdAt }),
    dryRun,
    step: "Comptes",
    onProgress,
  });

  // Dernière activité connue par compte : à défaut d'historique de connexion
  // (les sessions expirent sans laisser de trace), le dernier examen archivé
  // est le meilleur signal disponible pour l'antériorité.
  const dernierExamen = new Map();
  // Index par compte et par classe (`exams:acct:*`, `exams:class:*`), qui
  // remplacent les listes `examHistory:` / `classExams:` plafonnées à 200.
  // Reconstruits dans la MÊME passe que `exams:all` : les documents sont déjà
  // en main, un second SCAN ne rapporterait rien. C'est ce qui rend les
  // examens au-delà du 200e de nouveau atteignables (cf. src/lib/history.js).
  const parCompte = new Map(); // accountId -> [{score, member}]
  const parClasse = new Map(); // classId   -> [{score, member}]
  const range = (bucket, cle, paire) => {
    const liste = bucket.get(cle);
    if (liste) liste.push(paire);
    else bucket.set(cle, [paire]);
  };
  report.exams = await rebuild({
    pattern: "examRecord:*",
    indexKey: IDX_EXAMS,
    pick: (r) => ({ member: r.id, score: r.endedAt }),
    dryRun,
    step: "Examens",
    onProgress,
    onDoc: (r) => {
      const at = Number(r.endedAt) || 0;
      const paire = { score: at, member: r.id };
      if (r.accountId) range(parCompte, r.accountId, paire);
      if (r.classId) range(parClasse, r.classId, paire);
      if (!r.accountId || !at) return;
      if (at > (dernierExamen.get(r.accountId) || 0)) {
        dernierExamen.set(r.accountId, at);
      }
    },
  });

  // Un ZADD par compte et par classe : ces index sont scopés, on ne peut pas
  // les écrire en un seul lot comme les index globaux.
  report.examsParCompte = await writeBuckets(parCompte, examAcctKey, dryRun, {
    step: "Examens par compte",
    onProgress,
  });
  report.examsParClasse = await writeBuckets(parClasse, examClassKey, dryRun, {
    step: "Examens par classe",
    onProgress,
  });

  // `txn:*` ne matche ni `txnHistory:*` ni `txns:acct:*` (deux-points).
  const parCompteTxn = new Map();
  report.txns = await rebuild({
    pattern: "txn:*",
    indexKey: IDX_TXNS,
    pick: (t) => ({ member: t.id, score: t.createdAt }),
    dryRun,
    step: "Recharges",
    onProgress,
    onDoc: (t) => {
      if (!t.accountId) return;
      range(parCompteTxn, t.accountId, {
        score: Number(t.createdAt) || 0,
        member: t.id,
      });
    },
  });
  report.txnsParCompte = await writeBuckets(parCompteTxn, txnAcctKey, dryRun, {
    step: "Recharges par compte",
    onProgress,
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

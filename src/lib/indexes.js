import { getRedis } from "./redis.js";

// Index globaux datés — la fondation du pilotage (espace admin).
//
// Pourquoi ce module existe : toutes les autres clés du projet sont scopées
// par compte (`examHistory:{accountId}`, `txnHistory:{accountId}`…). Rien
// n'était donc énumérable globalement : on ne pouvait pas même répondre à
// « combien de comptes ? ». Ces ZSET, scorés par timestamp, rendent chaque
// famille d'objets à la fois dénombrable ET interrogeable par plage de dates
// (ZRANGEBYSCORE), ce qui débloque les courbes sans post-filtrage.
//
// Nommage : `plays:` et non `sessions:` — `session:{token}` et
// `sessionsByAccount:{id}` appartiennent déjà à l'authentification.

export const IDX_ACCOUNTS = "accounts:all"; // score = createdAt
export const IDX_EXAMS = "exams:all"; // score = endedAt (examens payants clôturés)
export const IDX_TXNS = "txns:all"; // score = createdAt (recharges)
export const IDX_PLAYS = "plays:all"; // score = startedAt (TOUTES les parties, Libre inclus)
export const IDX_LAST_SEEN = "accounts:lastSeen"; // score = dernière activité

export const playKey = (id) => `play:${id}`;

/**
 * Les écritures d'index ne doivent JAMAIS faire échouer l'action métier
 * qu'elles observent : un formateur qui lance un quiz devant sa classe ne
 * peut pas être bloqué par une statistique. On avale l'erreur en la traçant
 * (visible dans les logs de déploiement) ; la dérive éventuelle est
 * réparable a posteriori par le script de rattrapage.
 */
async function safely(label, fn) {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[indexes] écriture « ${label} » ignorée :`, err?.message || err);
    return null;
  }
}

const add = (key, member, score) =>
  safely(key, () => getRedis().zadd(key, { score: Number(score) || 0, member }));

export const indexAccount = (accountId, createdAt) =>
  add(IDX_ACCOUNTS, accountId, createdAt);

export const indexExam = (recordId, endedAt) => add(IDX_EXAMS, recordId, endedAt);

export const indexTxn = (txnId, createdAt) => add(IDX_TXNS, txnId, createdAt);

/**
 * Dernière activité d'un compte. Volontairement dans un ZSET séparé et NON
 * dans le document compte : celui-ci est réécrit en entier à chaque `set`,
 * donc une écriture d'activité concurrente écraserait un `balanceAr` crédité
 * au même instant (c'est précisément pourquoi credit/debit prennent un
 * verrou). Un ZADD est atomique et n'a pas ce défaut.
 *
 * Définition retenue : « connexion ou lancement de partie ». On ne touche pas
 * à chaque requête authentifiée — ce serait une écriture Redis par affichage
 * de page, et « a ouvert une page » dit moins que « a fait quelque chose ».
 */
export const touchLastSeen = (accountId, at = Date.now()) =>
  accountId ? add(IDX_LAST_SEEN, accountId, at) : null;

/**
 * Trace durable d'une partie lancée — y compris en mode Libre et pour les
 * hôtes non connectés, qui ne laissaient jusqu'ici aucune trace (les salles
 * expirent en 2 h et seuls les examens payants étaient archivés). C'est ce
 * qui rend l'entonnoir gratuit → payant observable.
 *
 * Document volontairement plat et léger : aucun classement, aucune donnée
 * nominative de participant.
 */
export async function indexPlay({
  id,
  code,
  mode,
  capacity,
  hostAccountId,
  startedAt,
}) {
  return safely("play", async () => {
    const redis = getRedis();
    const at = Number(startedAt) || Date.now();
    await redis.set(playKey(id), {
      id,
      code,
      mode,
      capacity: capacity || null,
      hostAccountId: hostAccountId || null,
      startedAt: at,
    });
    await redis.zadd(IDX_PLAYS, { score: at, member: id });
    return id;
  });
}

// — Lecture (espace admin) —

/** Nombre total d'entrées d'un index. */
export async function countAll(key) {
  return (await getRedis().zcard(key)) || 0;
}

/** Nombre d'entrées dont le score tombe dans [from, to] (bornes incluses). */
export async function countBetween(key, from, to = Date.now()) {
  return (await getRedis().zcount(key, from, to)) || 0;
}

/**
 * Identifiants dont le score tombe dans [from, to], du plus récent au plus
 * ancien. `limit` borne la charge : une page d'administration ne doit jamais
 * rapatrier un index entier.
 */
export async function idsBetween(key, from, to = Date.now(), limit = 500) {
  const ids = await getRedis().zrange(key, from, to, {
    byScore: true,
    rev: true,
    offset: 0,
    count: limit,
  });
  return Array.isArray(ids) ? ids : [];
}

/** Membres avec leur score, du plus récent au plus ancien : [{member, score}]. */
export async function entriesBetween(key, from, to = Date.now(), limit = 500) {
  const flat = await getRedis().zrange(key, from, to, {
    byScore: true,
    rev: true,
    withScores: true,
    offset: 0,
    count: limit,
  });
  const out = [];
  for (let i = 0; i < (flat?.length || 0); i += 2) {
    out.push({ member: flat[i], score: Number(flat[i + 1]) });
  }
  return out;
}

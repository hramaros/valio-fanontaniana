import { getRedis } from "./redis.js";
import { generateId } from "./code.js";
import { sanitizeQuiz, validateQuiz } from "./rooms.js";
import { recentDocs, countScoped } from "./scopedIndex.js";

// Bibliothèque de quiz durables, rattachée au compte formateur (sans TTL).
//
// Pourquoi ce module existe : jusqu'ici un quiz n'existait QUE dans une salle,
// qui s'auto-détruit au bout de 2 h (`ROOM_TTL_SEC`). Un formateur refaisait
// donc sa saisie à chaque cours, et rien ne pouvait survivre assez longtemps
// pour être programmé à l'avance ou importé en amont. C'est la fondation
// commune de la programmation d'examens et de l'import Google Forms.
//
// Index : ZSET `quizzes:acct:{accountId}` scoré par `updatedAt` — la
// bibliothèque se lit « le plus récemment touché d'abord », ce qui est l'ordre
// utile quand on vient relancer le quiz de la semaine dernière. Pas de liste
// héritée ici : le module naît avec des Sorted Sets.

const quizKey = (id) => `quiz:${id}`;
export const quizAcctKey = (accountId) => `quizzes:acct:${accountId}`;

/**
 * Plafond par compte, appliqué comme un REFUS À LA CRÉATION — même raisonnement
 * que `MAX_CLASSES_PER_ACCOUNT` : tronquer l'index laisserait des `quiz:{id}`
 * orphelins, présents dans Redis mais introuvables. `deleteQuiz` libère la
 * place, donc le plafond n'est pas définitif.
 */
export const MAX_QUIZZES_PER_ACCOUNT = 200;

/** Sources d'un quiz. `sourceUrl` n'est renseigné que pour un import. */
export const QUIZ_SOURCES = ["manuel", "google-forms"];

/**
 * Résumé pour la liste : on laisse les questions de côté. Une bibliothèque de
 * 50 quiz chargerait sinon des centaines de kilo-octets pour afficher des
 * titres.
 */
export function summarizeQuiz(q) {
  return {
    id: q.id,
    title: q.title,
    mode: q.mode,
    capacity: q.capacity,
    totalDurationSec: q.totalDurationSec,
    questionCount: (q.questions || []).length,
    source: q.source,
    sourceUrl: q.sourceUrl || null,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    usageCount: q.usageCount || 0,
    lastUsedAt: q.lastUsedAt || null,
  };
}

/**
 * Enregistre un nouveau quiz.
 *
 * La validation et la normalisation sont celles de `rooms.js`, délibérément :
 * un quiz qui entre par la bibliothèque doit être exactement aussi contraint
 * qu'un quiz posé directement dans une salle.
 */
export async function createQuiz(accountId, quiz, { source, sourceUrl } = {}) {
  if (!accountId) return { ok: false, status: 401, error: "Connexion requise." };
  const valid = validateQuiz(quiz);
  if (!valid.ok) return { ok: false, status: 400, error: valid.error };

  const redis = getRedis();
  const existing = await redis.zcard(quizAcctKey(accountId));
  if (Number(existing) >= MAX_QUIZZES_PER_ACCOUNT) {
    return {
      ok: false,
      status: 409,
      error: `Limite de ${MAX_QUIZZES_PER_ACCOUNT} quiz atteinte. Supprimez un quiz pour en enregistrer un nouveau.`,
    };
  }

  const at = Date.now();
  const doc = {
    id: generateId("qz"),
    accountId,
    ...sanitizeQuiz(quiz),
    source: QUIZ_SOURCES.includes(source) ? source : "manuel",
    sourceUrl: sourceUrl ? String(sourceUrl).slice(0, 500) : null,
    createdAt: at,
    updatedAt: at,
    usageCount: 0,
    lastUsedAt: null,
  };
  await redis.set(quizKey(doc.id), doc);
  await redis.zadd(quizAcctKey(accountId), { score: at, member: doc.id });
  return { ok: true, quiz: doc };
}

/** Détail d'un quiz — null s'il est inconnu ou n'appartient pas au compte. */
export async function getQuiz(accountId, quizId) {
  if (!accountId || !quizId) return null;
  const doc = await getRedis().get(quizKey(quizId));
  if (!doc || doc.accountId !== accountId) return null;
  return doc;
}

/** Remplace le contenu d'un quiz. Conserve l'origine et les compteurs d'usage. */
export async function updateQuiz(accountId, quizId, quiz) {
  const current = await getQuiz(accountId, quizId);
  if (!current) return { ok: false, status: 404, error: "Quiz introuvable." };
  const valid = validateQuiz(quiz);
  if (!valid.ok) return { ok: false, status: 400, error: valid.error };

  const at = Date.now();
  const doc = {
    ...current,
    ...sanitizeQuiz(quiz),
    // Ni l'identité, ni l'origine, ni l'historique d'usage ne se réécrivent
    // depuis le client : seul le contenu du quiz est modifiable.
    id: current.id,
    accountId: current.accountId,
    source: current.source,
    sourceUrl: current.sourceUrl,
    createdAt: current.createdAt,
    usageCount: current.usageCount || 0,
    lastUsedAt: current.lastUsedAt || null,
    updatedAt: at,
  };
  const redis = getRedis();
  await redis.set(quizKey(doc.id), doc);
  await redis.zadd(quizAcctKey(accountId), { score: at, member: doc.id });
  return { ok: true, quiz: doc };
}

/** Résumés des quiz d'un compte, du plus récemment modifié au plus ancien. */
export async function listQuizzes(accountId, limit = 24, opts = {}) {
  if (!accountId) return [];
  const docs = await recentDocs({
    zKey: quizAcctKey(accountId),
    legacyKey: null,
    docKey: quizKey,
    dateField: "updatedAt",
    limit,
    ...opts,
  });
  return docs.map(summarizeQuiz);
}

/** Nombre de quiz enregistrés par un compte. */
export async function countQuizzes(accountId) {
  if (!accountId) return 0;
  return countScoped(quizAcctKey(accountId), null);
}

export async function deleteQuiz(accountId, quizId) {
  const current = await getQuiz(accountId, quizId);
  if (!current) return { ok: false, status: 404, error: "Quiz introuvable." };
  const redis = getRedis();
  // L'index d'abord : si la suppression du document échouait, mieux vaut un
  // document orphelin qu'une entrée d'index qui pointe dans le vide et casse
  // la liste à chaque chargement.
  await redis.zrem(quizAcctKey(accountId), quizId);
  await redis.del(quizKey(quizId));
  return { ok: true };
}

/**
 * Duplique un quiz. Les identifiants de questions et de réponses sont
 * régénérés par `sanitizeQuiz`… à condition de les retirer d'abord : il les
 * conserve quand ils sont présents. Deux quiz partageant des ids de questions
 * ne casseraient rien aujourd'hui, mais c'est le genre de collision dont on ne
 * veut pas dans un carnet de notes.
 */
export async function duplicateQuiz(accountId, quizId) {
  const current = await getQuiz(accountId, quizId);
  if (!current) return { ok: false, status: 404, error: "Quiz introuvable." };
  const copie = {
    ...current,
    title: `${current.title} (copie)`.slice(0, 120),
    questions: (current.questions || []).map((q) => ({
      ...q,
      id: undefined,
      answers: (q.answers || []).map((a) => ({ ...a, id: undefined })),
    })),
  };
  return createQuiz(accountId, copie, {
    source: current.source,
    sourceUrl: current.sourceUrl,
  });
}

/**
 * Marque un quiz comme utilisé (compteur + date). Ne fait jamais échouer le
 * lancement : un compteur d'usage ne vaut pas qu'on empêche un cours de
 * démarrer.
 */
export async function markQuizUsed(accountId, quizId) {
  try {
    const current = await getQuiz(accountId, quizId);
    if (!current) return null;
    const at = Date.now();
    current.usageCount = (Number(current.usageCount) || 0) + 1;
    current.lastUsedAt = at;
    // `updatedAt` n'est volontairement PAS touché : lancer un quiz n'est pas
    // le modifier, et ferait remonter en tête de bibliothèque un quiz dont le
    // contenu n'a pas bougé. Le score de l'index reste donc inchangé.
    await getRedis().set(quizKey(current.id), current);
    return current;
  } catch (err) {
    console.warn("[quizzes] compteur d'usage ignoré :", err?.message || err);
    return null;
  }
}

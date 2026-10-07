import { getRedis } from "./redis.js";
import { generateVerifyCode, normalizeVerifyCode } from "./code.js";
import { indexExam } from "./indexes.js";
import { PAGE_MAX, recentDocs, countScoped } from "./scopedIndex.js";

// Historique durable des examens pro, rattaché au compte formateur (sans TTL).
//
// Les index par compte et par classe sont des ZSET scorés par `endedAt`, lus
// par curseur : voir src/lib/scopedIndex.js pour le pourquoi (ils étaient
// des listes plafonnées à 200, ce qui rendait les examens suivants
// inatteignables) et pour la mécanique de transition.
//
// Nommage aligné sur src/lib/indexes.js (`exams:all`). Une clé Redis ne peut
// pas être à la fois liste et ZSET : les anciennes clés gardent donc leur nom
// et sont lues en complément jusqu'au rattrapage (scripts/backfill-indexes.mjs).

const recordKey = (id) => `examRecord:${id}`;
// Exportées : le rattrapage (src/lib/backfill.js) reconstruit ces mêmes
// index, et deux modules qui épellent une clé Redis chacun de leur côté
// finissent toujours par diverger.
export const examAcctKey = (accountId) => `exams:acct:${accountId}`;
export const examClassKey = (classId) => `exams:class:${classId}`;
const verifyKey = (code) => `verifyCode:${code}`;
// Clés héritées : lecture seule, on n'y écrit plus.
export const legacyAcctKey = (accountId) => `examHistory:${accountId}`;
export const legacyClassKey = (classId) => `classExams:${classId}`;

/**
 * Garantit qu'un enregistrement porte un code de consultation publique.
 * Rattrapage paresseux des examens antérieurs à la fonctionnalité : le code
 * est généré (et indexé) à la première lecture côté formateur.
 */
async function ensureVerifyCode(record) {
  if (!record || record.verifyCode) return record;
  const redis = getRedis();
  record.verifyCode = generateVerifyCode();
  await redis.set(recordKey(record.id), record);
  await redis.set(verifyKey(record.verifyCode), record.id);
  return record;
}

/** Résumé (liste) : on n'expose pas le classement complet. */
function summarize(r) {
  return {
    id: r.id,
    code: r.code,
    verifyCode: r.verifyCode,
    title: r.title,
    mode: r.mode,
    capacity: r.capacity,
    classId: r.classId,
    className: r.className,
    endedAt: r.endedAt,
    priceAr: r.priceAr,
    charged: r.charged,
    participantCount: r.participantCount,
    nbQuestions: r.nbQuestions,
    avgNote: r.avgNote,
    avgScore: r.avgScore,
  };
}

export async function saveExamRecord(record) {
  const redis = getRedis();
  if (!record.verifyCode) record.verifyCode = generateVerifyCode();
  // Une date absente mettrait l'examen au fond du ZSET pour toujours ; mieux
  // vaut l'horodater maintenant que le rendre introuvable dans un carnet.
  const score = Number(record.endedAt) || Date.now();
  await redis.set(recordKey(record.id), record);
  await redis.set(verifyKey(record.verifyCode), record.id);
  await redis.zadd(examAcctKey(record.accountId), { score, member: record.id });
  // Index par classe (pour le carnet de notes).
  if (record.classId) {
    await redis.zadd(examClassKey(record.classId), { score, member: record.id });
  }
  // Index global daté (pilotage).
  await indexExam(record.id, record.endedAt);
  return record.id;
}

/** Enregistrements complets d'un index, du plus récent au plus ancien. */
async function recentRecords(zKey, legacyKey, { limit, before, afterId } = {}) {
  const page = await recentDocs({
    zKey,
    legacyKey,
    docKey: recordKey,
    dateField: "endedAt",
    limit,
    before,
    afterId,
  });
  return Promise.all(page.map(ensureVerifyCode));
}

/** Examens complets (avec classement) rattachés à une classe — ordre chronologique. */
export async function getClassExamRecords(classId, limit = PAGE_MAX, opts = {}) {
  const records = await recentRecords(examClassKey(classId), legacyClassKey(classId), {
    limit,
    ...opts,
  });
  // Un carnet de notes se lit du plus ancien au plus récent.
  return records.reverse();
}

export async function listExamRecords(accountId, limit = 50, opts = {}) {
  const records = await recentRecords(examAcctKey(accountId), legacyAcctKey(accountId), {
    limit,
    ...opts,
  });
  return records.map(summarize);
}

/**
 * Nombre d'examens archivés par un compte. Sert à savoir s'il reste une page
 * à charger sans rapatrier tout l'historique.
 */
export async function countExamRecords(accountId) {
  return countScoped(examAcctKey(accountId), legacyAcctKey(accountId));
}

/** Détail d'un examen — null si inconnu ou n'appartenant pas au compte. */
export async function getExamRecord(accountId, recordId) {
  const redis = getRedis();
  const rec = await redis.get(recordKey(recordId));
  if (!rec || rec.accountId !== accountId) return null;
  return ensureVerifyCode(rec);
}

/**
 * Consultation publique : retrouve un examen par son code de consultation.
 * Accepte les saisies approximatives (minuscules, sans tirets…).
 */
export async function getExamRecordByVerifyCode(input) {
  const code = normalizeVerifyCode(input);
  if (!code) return null;
  const redis = getRedis();
  const id = await redis.get(verifyKey(code));
  if (!id) return null;
  return redis.get(recordKey(id));
}

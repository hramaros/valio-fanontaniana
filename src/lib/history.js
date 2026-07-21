import { getRedis } from "./redis.js";
import { generateVerifyCode, normalizeVerifyCode } from "./code.js";
import { indexExam } from "./indexes.js";

// Historique durable des examens pro, rattaché au compte formateur (sans TTL).
const HISTORY_MAX = 200;
const recordKey = (id) => `examRecord:${id}`;
const listKey = (accountId) => `examHistory:${accountId}`;
const classListKey = (classId) => `classExams:${classId}`;
const verifyKey = (code) => `verifyCode:${code}`;

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
  await redis.set(recordKey(record.id), record);
  await redis.set(verifyKey(record.verifyCode), record.id);
  await redis.lpush(listKey(record.accountId), record.id);
  await redis.ltrim(listKey(record.accountId), 0, HISTORY_MAX - 1);
  // Index par classe (pour le carnet de notes).
  if (record.classId) {
    await redis.lpush(classListKey(record.classId), record.id);
    await redis.ltrim(classListKey(record.classId), 0, HISTORY_MAX - 1);
  }
  // Index global daté (pilotage). À noter : les listes par compte et par
  // classe sont tronquées à HISTORY_MAX, celle-ci ne l'est pas — c'est
  // justement elle qui garde la mémoire longue de l'activité.
  await indexExam(record.id, record.endedAt);
  return record.id;
}

/** Examens complets (avec classement) rattachés à une classe — ordre chronologique. */
export async function getClassExamRecords(classId, limit = 200) {
  const redis = getRedis();
  const ids = await redis.lrange(classListKey(classId), 0, limit - 1);
  if (!ids || ids.length === 0) return [];
  const records = await redis.mget(...ids.map(recordKey));
  // lpush met le plus récent en tête ; on remet en ordre chronologique.
  return Promise.all(records.filter(Boolean).reverse().map(ensureVerifyCode));
}

export async function listExamRecords(accountId, limit = 50) {
  const redis = getRedis();
  const ids = await redis.lrange(listKey(accountId), 0, limit - 1);
  if (!ids || ids.length === 0) return [];
  const records = await redis.mget(...ids.map(recordKey));
  const complete = await Promise.all(records.filter(Boolean).map(ensureVerifyCode));
  return complete.map(summarize);
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

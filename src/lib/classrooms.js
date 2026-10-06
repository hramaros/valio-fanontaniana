import { getRedis } from "./redis.js";
import { generateId } from "./code.js";

// Classes durables rattachées au compte formateur, avec un roster d'élèves.
const classKey = (id) => `class:${id}`;
const listKey = (accountId) => `classList:${accountId}`;

/**
 * Plafond du nombre de classes par compte.
 *
 * Volontairement appliqué comme un REFUS À LA CRÉATION, et non comme un
 * `LTRIM` à la manière de l'historique d'examens. La différence est
 * importante : tronquer cette liste ne masquerait pas de vieilles données, elle
 * rendrait des classes **inaccessibles** — leur `class:{id}` et le carnet de
 * notes associé survivraient dans Redis sans plus apparaître nulle part. Mieux
 * vaut échouer bruyamment que faire disparaître un carnet en silence.
 *
 * `deleteClass` retire bien l'entrée de la liste (`LREM`), donc le plafond
 * n'est pas un plafond définitif : supprimer une classe libère la place.
 */
export const MAX_CLASSES_PER_ACCOUNT = 200;

function summary(c) {
  return { id: c.id, name: c.name, studentCount: (c.students || []).length };
}

export async function createClass(accountId, name) {
  const redis = getRedis();
  const clean = String(name || "").trim().slice(0, 80);
  if (!clean) return { ok: false, status: 400, error: "Nom de classe requis." };

  const existing = await redis.llen(listKey(accountId));
  if (Number(existing) >= MAX_CLASSES_PER_ACCOUNT)
    return {
      ok: false,
      status: 409,
      error: `Limite de ${MAX_CLASSES_PER_ACCOUNT} classes atteinte. Supprimez une classe pour en créer une nouvelle.`,
    };

  const id = generateId("cls");
  const classroom = {
    id,
    accountId,
    name: clean,
    students: [],
    createdAt: Date.now(),
  };
  await redis.set(classKey(id), classroom);
  await redis.lpush(listKey(accountId), id);
  return { ok: true, classroom };
}

export async function listClasses(accountId) {
  const redis = getRedis();
  const ids = await redis.lrange(listKey(accountId), 0, -1);
  if (!ids || ids.length === 0) return [];
  const classes = await redis.mget(...ids.map(classKey));
  return classes.filter(Boolean).map(summary);
}

/** Détail d'une classe — null si inconnue ou n'appartenant pas au compte. */
export async function getClass(accountId, classId) {
  const redis = getRedis();
  const c = await redis.get(classKey(classId));
  if (!c || c.accountId !== accountId) return null;
  return c;
}

export async function renameClass(accountId, classId, name) {
  const c = await getClass(accountId, classId);
  if (!c) return { ok: false, status: 404, error: "Classe introuvable." };
  const clean = String(name || "").trim().slice(0, 80);
  if (!clean) return { ok: false, status: 400, error: "Nom requis." };
  c.name = clean;
  await getRedis().set(classKey(classId), c);
  return { ok: true, classroom: c };
}

export async function deleteClass(accountId, classId) {
  const redis = getRedis();
  const c = await getClass(accountId, classId);
  if (!c) return { ok: false, status: 404, error: "Classe introuvable." };
  await redis.del(classKey(classId));
  await redis.lrem(listKey(accountId), 0, classId);
  return { ok: true };
}

export async function addStudent(accountId, classId, name) {
  const c = await getClass(accountId, classId);
  if (!c) return { ok: false, status: 404, error: "Classe introuvable." };
  const clean = String(name || "").trim().slice(0, 60);
  if (!clean) return { ok: false, status: 400, error: "Nom d'élève requis." };
  const student = { id: generateId("st"), name: clean };
  c.students = [...(c.students || []), student];
  await getRedis().set(classKey(classId), c);
  return { ok: true, student, classroom: c };
}

export async function removeStudent(accountId, classId, studentId) {
  const c = await getClass(accountId, classId);
  if (!c) return { ok: false, status: 404, error: "Classe introuvable." };
  c.students = (c.students || []).filter((s) => s.id !== studentId);
  await getRedis().set(classKey(classId), c);
  return { ok: true, classroom: c };
}

import { getRedis } from "./redis.js";

// Réservation d'un code de salle avant que la salle existe.
//
// Pourquoi ce module existe : un examen programmé doit porter son code dès la
// programmation, pour que le formateur le distribue à l'avance (au tableau,
// dans un cahier de textes). Or la salle, elle, ne naîtra qu'à l'heure dite.
// Entre les deux, le code doit être tenu pour pris — sinon `createRoom`
// pourrait le réattribuer à une partie improvisée, et deux examens se
// retrouveraient sur le même code.
//
// Module séparé pour une raison précise : `scheduled.js` importe `rooms.js`
// (createRoom, setQuiz, startGame). Si `rooms.js` devait importer
// `scheduled.js` pour connaître les codes réservés, l'import serait circulaire.
// Ces quelques clés vivent donc à part, et les deux modules en dépendent sans
// se connaître.

export const reservedCodeKey = (code) => `reservedCode:${code}`;

/** Le code est-il déjà retenu par un examen programmé ? */
export async function isCodeReserved(code) {
  if (!code) return false;
  return !!(await getRedis().exists(reservedCodeKey(code)));
}

/**
 * Retient un code au profit d'un objet (identifiant d'examen programmé).
 * `NX` : la réservation échoue si le code est déjà pris, ce qui rend l'appel
 * sûr entre invocations serverless concurrentes.
 *
 * Sans TTL : un examen peut être programmé des mois à l'avance, et un code qui
 * expirerait entre-temps réapparaîtrait dans le tirage de `createRoom` alors
 * qu'il est affiché sur un tableau.
 */
export async function reserveCode(code, ownerId) {
  if (!code || !ownerId) return false;
  const ok = await getRedis().set(reservedCodeKey(code), ownerId, { nx: true });
  return !!ok;
}

/** À qui ce code est-il réservé ? `null` s'il est libre. */
export async function resolveReservedCode(code) {
  if (!code) return null;
  return (await getRedis().get(reservedCodeKey(code))) || null;
}

/** Libère un code (examen annulé, ou terminé et archivé). */
export async function releaseCode(code) {
  if (!code) return;
  await getRedis().del(reservedCodeKey(code));
}

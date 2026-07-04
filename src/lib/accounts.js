import { getRedis } from "./redis.js";
import { generateId } from "./code.js";
import { withLock } from "./lock.js";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Comptes formateur durables (sans TTL). Sessions par token (TTL 30 j).
const SESSION_TTL_SEC = 30 * 24 * 3600;

const accountKey = (id) => `account:${id}`;
const emailKey = (email) => `accountEmail:${email}`;
const sessionKey = (token) => `session:${token}`;
const sessionsByAccountKey = (accountId) => `sessionsByAccount:${accountId}`;

const normEmail = (e) => String(e || "").trim().toLowerCase();

function hashPassword(pw) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(pw), salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}
function verifyPassword(pw, stored) {
  const [saltHex, hashHex] = String(stored || "").split(":");
  if (!saltHex || !hashHex) return false;
  const hash = scryptSync(String(pw), Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}

/** Vue publique d'un compte (jamais le hash). */
function publicAccount(a) {
  if (!a) return null;
  return { id: a.id, email: a.email, name: a.name, balanceAr: a.balanceAr };
}

export async function createAccount({ email, password, name }) {
  const redis = getRedis();
  const e = normEmail(email);
  if (!e || !/.+@.+\..+/.test(e))
    return { ok: false, status: 400, error: "Email invalide." };
  if (!password || String(password).length < 6)
    return { ok: false, status: 400, error: "Mot de passe : 6 caractères minimum." };
  if (await redis.get(emailKey(e)))
    return { ok: false, status: 409, error: "Email déjà utilisé." };

  const id = generateId("acc");
  const account = {
    id,
    email: e,
    name: String(name || "").trim().slice(0, 60) || e.split("@")[0],
    passwordHash: hashPassword(password),
    provider: "password",
    balanceAr: 0,
    createdAt: Date.now(),
  };
  await redis.set(accountKey(id), account);
  await redis.set(emailKey(e), id);
  return { ok: true, account: publicAccount(account) };
}

/**
 * Compte fédéré (Google…) : retrouve par email vérifié, sinon crée un compte
 * sans mot de passe. Réutilise le même modèle (sessions, solde, historique).
 */
export async function getOrCreateByEmail({ email, name, provider = "google" }) {
  const redis = getRedis();
  const e = normEmail(email);
  if (!e || !/.+@.+\..+/.test(e))
    return { ok: false, error: "Email Google invalide." };

  const existingId = await redis.get(emailKey(e));
  if (existingId) {
    const acc = await redis.get(accountKey(existingId));
    if (acc) return { ok: true, account: publicAccount(acc) };
  }

  const id = generateId("acc");
  const account = {
    id,
    email: e,
    name: String(name || "").trim().slice(0, 60) || e.split("@")[0],
    passwordHash: null,
    provider,
    balanceAr: 0,
    createdAt: Date.now(),
  };
  await redis.set(accountKey(id), account);
  await redis.set(emailKey(e), id);
  return { ok: true, account: publicAccount(account) };
}

export async function authenticate({ email, password }) {
  const redis = getRedis();
  const id = await redis.get(emailKey(normEmail(email)));
  if (!id) return { ok: false, status: 401, error: "Identifiants invalides." };
  const account = await redis.get(accountKey(id));
  if (!account || !verifyPassword(password, account.passwordHash))
    return { ok: false, status: 401, error: "Identifiants invalides." };
  return { ok: true, account: publicAccount(account) };
}

export async function getAccountById(id) {
  const redis = getRedis();
  return publicAccount(await redis.get(accountKey(id)));
}

export async function createSession(accountId) {
  const redis = getRedis();
  const token = randomBytes(32).toString("hex");
  await redis.set(sessionKey(token), accountId, { ex: SESSION_TTL_SEC });
  await redis.sadd(sessionsByAccountKey(accountId), token);
  await redis.expire(sessionsByAccountKey(accountId), SESSION_TTL_SEC);
  return token;
}

export async function getAccountByToken(token) {
  if (!token) return null;
  const redis = getRedis();
  const id = await redis.get(sessionKey(token));
  if (!id) return null;
  return getAccountById(id);
}

export async function deleteSession(token) {
  if (!token) return;
  const redis = getRedis();
  const accountId = await redis.get(sessionKey(token));
  await redis.del(sessionKey(token));
  if (accountId) await redis.srem(sessionsByAccountKey(accountId), token);
}

/**
 * Révoque toutes les sessions actives d'un compte sauf `exceptToken` (utilisé
 * après un reset de mot de passe si l'utilisateur coche « se déconnecter des
 * autres appareils »). Best-effort : des tokens déjà expirés naturellement
 * dans l'index n'ont plus de clé `session:*` à supprimer, sans conséquence.
 */
export async function revokeOtherSessions(accountId, exceptToken) {
  const redis = getRedis();
  const tokens = await redis.smembers(sessionsByAccountKey(accountId));
  const others = tokens.filter((t) => t !== exceptToken);
  for (const t of others) {
    await redis.del(sessionKey(t));
    await redis.srem(sessionsByAccountKey(accountId), t);
  }
  return { ok: true, revoked: others.length };
}

/**
 * Crédite le solde d'un compte (primitive utilisée par la couche paiement).
 *
 * Le solde vit dans le blob JSON `account:*` (lecture-modification-écriture,
 * pas d'INCRBY atomique) : deux crédits/débits concurrents sur le même
 * compte (ex. deux salles Examen qui se règlent presque en même temps pour
 * le même formateur) pourraient sinon s'écraser l'un l'autre (mise à jour
 * perdue). Le verrou par compte sérialise cet accès sans changer le schéma.
 */
export async function credit(accountId, amountAr) {
  const { locked, result } = await withLock(`lock:account:${accountId}`, async () => {
    const redis = getRedis();
    const account = await redis.get(accountKey(accountId));
    if (!account) return { ok: false, status: 404, error: "Compte introuvable." };
    account.balanceAr = (Number(account.balanceAr) || 0) + (Number(amountAr) || 0);
    await redis.set(accountKey(accountId), account);
    return { ok: true, balanceAr: account.balanceAr };
  });
  if (!locked) return { ok: false, status: 503, error: "Compte occupé, réessayez." };
  return result;
}

/** Recharge de test : alias de credit (conservé pour les tests / le stub). */
export async function topupTest(accountId, amountAr) {
  return credit(accountId, amountAr);
}

/** Débite le solde (refuse si insuffisant). Voir credit() pour le verrou. */
export async function debit(accountId, amountAr) {
  const { locked, result } = await withLock(`lock:account:${accountId}`, async () => {
    const redis = getRedis();
    const account = await redis.get(accountKey(accountId));
    if (!account) return { ok: false, error: "Compte introuvable." };
    const amt = Number(amountAr) || 0;
    if ((Number(account.balanceAr) || 0) < amt)
      return { ok: false, error: "Solde insuffisant." };
    account.balanceAr -= amt;
    await redis.set(accountKey(accountId), account);
    return { ok: true, balanceAr: account.balanceAr };
  });
  if (!locked) return { ok: false, error: "Compte occupé, réessayez." };
  return result;
}

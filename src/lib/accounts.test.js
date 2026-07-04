import { test } from "node:test";
import assert from "node:assert/strict";
import { setRedisClient } from "./redis.js";
import { createFakeRedis } from "./testFakeRedis.js";
import {
  createAccount,
  authenticate,
  getAccountById,
  createSession,
  getAccountByToken,
  deleteSession,
  topupTest,
  debit,
  credit,
  getOrCreateByEmail,
  revokeOtherSessions,
} from "./accounts.js";

test("createAccount : crée (email normalisé, solde 0) puis refuse le doublon", async () => {
  setRedisClient(createFakeRedis());
  const r1 = await createAccount({
    email: "Prof@Ecole.mg",
    password: "secret1",
    name: "Prof",
  });
  assert.equal(r1.ok, true);
  assert.equal(r1.account.email, "prof@ecole.mg");
  assert.equal(r1.account.balanceAr, 0);
  assert.equal(r1.account.passwordHash, undefined); // jamais exposé

  const r2 = await createAccount({ email: "prof@ecole.mg", password: "autre1" });
  assert.equal(r2.ok, false);
  assert.equal(r2.status, 409);
});

test("createAccount : valide email et longueur du mot de passe", async () => {
  setRedisClient(createFakeRedis());
  assert.equal((await createAccount({ email: "x", password: "secret1" })).ok, false);
  assert.equal((await createAccount({ email: "a@b.mg", password: "123" })).ok, false);
});

test("authenticate : bon et mauvais mot de passe", async () => {
  setRedisClient(createFakeRedis());
  await createAccount({ email: "p@e.mg", password: "secret1", name: "P" });
  assert.equal((await authenticate({ email: "p@e.mg", password: "secret1" })).ok, true);
  assert.equal((await authenticate({ email: "p@e.mg", password: "wrong" })).ok, false);
  assert.equal((await authenticate({ email: "no@e.mg", password: "secret1" })).ok, false);
});

test("sessions : create → getByToken → delete", async () => {
  setRedisClient(createFakeRedis());
  const { account } = await createAccount({ email: "p@e.mg", password: "secret1" });
  const token = await createSession(account.id);
  assert.equal((await getAccountByToken(token)).id, account.id);
  await deleteSession(token);
  assert.equal(await getAccountByToken(token), null);
});

test("getOrCreateByEmail : crée un compte Google puis le réutilise (pas de doublon)", async () => {
  setRedisClient(createFakeRedis());
  const r1 = await getOrCreateByEmail({ email: "Prof@Gmail.com", name: "Prof G" });
  assert.equal(r1.ok, true);
  assert.equal(r1.account.email, "prof@gmail.com");
  assert.equal(r1.account.balanceAr, 0);
  const r2 = await getOrCreateByEmail({ email: "prof@gmail.com", name: "Autre" });
  assert.equal(r2.account.id, r1.account.id);
});

test("getOrCreateByEmail : relie un compte email+mdp existant (même email)", async () => {
  setRedisClient(createFakeRedis());
  const created = await createAccount({ email: "p@e.mg", password: "secret1" });
  const g = await getOrCreateByEmail({ email: "p@e.mg", name: "G" });
  assert.equal(g.account.id, created.account.id);
});

test("topup et debit", async () => {
  setRedisClient(createFakeRedis());
  const { account } = await createAccount({ email: "p@e.mg", password: "secret1" });
  assert.equal((await topupTest(account.id, 5000)).balanceAr, 5000);

  const d = await debit(account.id, 1000);
  assert.equal(d.ok, true);
  assert.equal(d.balanceAr, 4000);

  const bad = await debit(account.id, 999999);
  assert.equal(bad.ok, false);
  assert.equal((await getAccountById(account.id)).balanceAr, 4000);
});

test("credit/debit concurrents sur le même compte : pas de mise à jour perdue", async () => {
  setRedisClient(createFakeRedis());
  const { account } = await createAccount({ email: "race@e.mg", password: "secret1" });
  await topupTest(account.id, 1000);

  // 20 crédits de 100 Ar + 10 débits de 50 Ar en parallèle (host + participants
  // qui déclenchent des règlements presque simultanés). Sans verrou, ces
  // lecture-modification-écriture concurrentes sur le même blob JSON se
  // marchent dessus et perdent des mises à jour.
  const credits = Array.from({ length: 20 }, () => credit(account.id, 100));
  const debits = Array.from({ length: 10 }, () => debit(account.id, 50));
  const results = await Promise.all([...credits, ...debits]);

  assert.ok(results.every((r) => r.ok));
  const final = await getAccountById(account.id);
  assert.equal(final.balanceAr, 1000 + 20 * 100 - 10 * 50);
});

test("revokeOtherSessions : révoque les autres sessions, garde celle exceptée", async () => {
  setRedisClient(createFakeRedis());
  const { account } = await createAccount({ email: "multi@e.mg", password: "secret1" });
  const tokenA = await createSession(account.id);
  const tokenB = await createSession(account.id);
  const tokenC = await createSession(account.id);

  const res = await revokeOtherSessions(account.id, tokenC);
  assert.equal(res.ok, true);
  assert.equal(res.revoked, 2);

  assert.equal(await getAccountByToken(tokenA), null);
  assert.equal(await getAccountByToken(tokenB), null);
  assert.equal((await getAccountByToken(tokenC)).id, account.id);
});

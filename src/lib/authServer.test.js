import { test } from "node:test";
import assert from "node:assert/strict";
import { setRedisClient } from "./redis.js";
import { createFakeRedis } from "./testFakeRedis.js";
import { accountFromRequest, adminFromRequest } from "./authServer.js";
import { createAccount, createSession, setRole, ROLE_ADMIN } from "./accounts.js";

// La barrière réelle de l'espace de pilotage. Le `role` renvoyé au navigateur
// n'est qu'une affordance d'affichage : c'est ici que l'accès se décide.

const requeteAvecCookie = (token) =>
  new Request("http://localhost/api/admin/overview", {
    headers: token ? { cookie: `valio_session=${token}` } : {},
  });

async function compteConnecte(email, role) {
  const { account } = await createAccount({ email, password: "secret1" });
  if (role) await setRole(account.id, role);
  return { account, token: await createSession(account.id) };
}

test("sans session : ni compte, ni admin", async () => {
  setRedisClient(createFakeRedis());
  assert.equal(await accountFromRequest(requeteAvecCookie(null)), null);
  assert.equal(await adminFromRequest(requeteAvecCookie(null)), null);
});

test("token forgé : refusé", async () => {
  setRedisClient(createFakeRedis());
  const bidon = "a".repeat(64);
  assert.equal(await adminFromRequest(requeteAvecCookie(bidon)), null);
});

test("formateur connecté : authentifié mais PAS admin", async () => {
  setRedisClient(createFakeRedis());
  const { token } = await compteConnecte("prof@e.mg");

  const compte = await accountFromRequest(requeteAvecCookie(token));
  assert.ok(compte, "la session est bien valide");
  assert.equal(compte.email, "prof@e.mg");

  assert.equal(
    await adminFromRequest(requeteAvecCookie(token)),
    null,
    "une session valide ne suffit pas",
  );
});

test("admin connecté : reconnu", async () => {
  setRedisClient(createFakeRedis());
  const { token } = await compteConnecte("chef@e.mg", ROLE_ADMIN);

  const admin = await adminFromRequest(requeteAvecCookie(token));
  assert.ok(admin);
  assert.equal(admin.email, "chef@e.mg");
  assert.equal(admin.role, ROLE_ADMIN);
});

test("rétrograder ferme l'accès sans avoir à révoquer la session", async () => {
  setRedisClient(createFakeRedis());
  const { account, token } = await compteConnecte("ex@e.mg", ROLE_ADMIN);
  assert.ok(await adminFromRequest(requeteAvecCookie(token)));

  await setRole(account.id, "trainer");

  assert.equal(
    await adminFromRequest(requeteAvecCookie(token)),
    null,
    "le rôle est relu à chaque requête, pas figé dans le jeton",
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { setRedisClient } from "./redis.js";
import { createFakeRedis } from "./testFakeRedis.js";
import { checkRateLimit, clientIp } from "./rateLimit.js";

test("checkRateLimit : autorise jusqu'à la limite puis refuse dans la même fenêtre", async () => {
  setRedisClient(createFakeRedis());
  const results = [];
  for (let i = 0; i < 12; i++) {
    results.push(await checkRateLimit("auth", "1.2.3.4"));
  }
  // bucket "auth" : limite 10 par fenêtre.
  assert.equal(results.filter(Boolean).length, 10);
  assert.equal(results.slice(10).every((r) => r === false), true);
});

test("checkRateLimit : isolé par identifiant (une IP ne consomme pas le quota d'une autre)", async () => {
  setRedisClient(createFakeRedis());
  for (let i = 0; i < 10; i++) await checkRateLimit("auth", "1.1.1.1");
  assert.equal(await checkRateLimit("auth", "1.1.1.1"), false, "1.1.1.1 a épuisé son quota");
  assert.equal(await checkRateLimit("auth", "2.2.2.2"), true, "2.2.2.2 a son propre quota");
});

test("checkRateLimit : isolé par bucket (les compteurs ne se mélangent pas)", async () => {
  setRedisClient(createFakeRedis());
  for (let i = 0; i < 10; i++) await checkRateLimit("auth", "9.9.9.9");
  assert.equal(await checkRateLimit("auth", "9.9.9.9"), false);
  assert.equal(await checkRateLimit("verify", "9.9.9.9"), true, "bucket différent = compteur différent");
});

test("checkRateLimit : bucket inconnu lève une erreur explicite", async () => {
  setRedisClient(createFakeRedis());
  await assert.rejects(() => checkRateLimit("inexistant", "1.2.3.4"));
});

test("clientIp : lit x-forwarded-for, retourne « unknown » si absent", () => {
  const withHeader = { headers: { get: () => "203.0.113.5, 10.0.0.1" } };
  assert.equal(clientIp(withHeader), "203.0.113.5");
  const withoutHeader = { headers: { get: () => null } };
  assert.equal(clientIp(withoutHeader), "unknown");
});

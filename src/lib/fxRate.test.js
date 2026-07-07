import { test } from "node:test";
import assert from "node:assert/strict";
import { setRedisClient } from "./redis.js";
import { createFakeRedis } from "./testFakeRedis.js";
import { getArPerEurRate } from "./fxRate.js";

function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    process.env[k] = vars[k];
  }
  return fn().finally(() => {
    for (const k of Object.keys(vars)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });
}

function withFetch(fakeFetch, fn) {
  const prev = globalThis.fetch;
  globalThis.fetch = fakeFetch;
  return fn().finally(() => {
    globalThis.fetch = prev;
  });
}

test("getArPerEurRate : cache Redis frais → pas d'appel réseau", async () => {
  const redis = createFakeRedis();
  await redis.set("fxRate:EUR:MGA", 5000);
  setRedisClient(redis);
  let called = false;
  await withFetch(
    async () => { called = true; return { ok: true, json: async () => ({}) }; },
    async () => {
      assert.equal(await getArPerEurRate(), 5000);
    },
  );
  assert.equal(called, false, "le cache frais évite l'appel réseau");
});

test("getArPerEurRate : sans cache → fetch en direct, met en cache + dernier connu", async () => {
  const redis = createFakeRedis();
  setRedisClient(redis);
  await withFetch(
    async () => ({ ok: true, json: async () => ({ rates: { MGA: 4900 } }) }),
    async () => {
      assert.equal(await getArPerEurRate(), 4900);
    },
  );
  assert.equal(await redis.get("fxRate:EUR:MGA"), 4900);
  assert.equal(await redis.get("fxRate:EUR:MGA:last"), 4900);
});

test("getArPerEurRate : fetch échoue → repli sur le dernier taux connu", async () => {
  const redis = createFakeRedis();
  await redis.set("fxRate:EUR:MGA:last", 4700);
  setRedisClient(redis);
  await withFetch(
    async () => { throw new Error("réseau down"); },
    async () => {
      assert.equal(await getArPerEurRate({ timeoutMs: 50 }), 4700);
    },
  );
});

test("getArPerEurRate : fetch échoue et aucun dernier taux → constante d'env", async () => {
  const redis = createFakeRedis();
  setRedisClient(redis);
  await withEnv({ STRIPE_EUR_TO_AR_FALLBACK_RATE: "5100" }, () =>
    withFetch(
      async () => { throw new Error("réseau down"); },
      async () => {
        assert.equal(await getArPerEurRate({ timeoutMs: 50 }), 5100);
      },
    ),
  );
});

test("getArPerEurRate : écrit le cache avec un TTL de 6h exactement", async () => {
  const redis = createFakeRedis();
  const originalSet = redis.set.bind(redis);
  let capturedEx = null;
  redis.set = async (key, value, opts) => {
    if (key === "fxRate:EUR:MGA") capturedEx = opts?.ex;
    return originalSet(key, value, opts);
  };
  setRedisClient(redis);
  await withFetch(
    async () => ({ ok: true, json: async () => ({ rates: { MGA: 4900 } }) }),
    async () => {
      await getArPerEurRate();
    },
  );
  assert.equal(capturedEx, 6 * 3600, "TTL du cache = 6h, honoré par le faux Redis (voir testFakeRedis.js)");
});

test("getArPerEurRate : un taux en cache de 0 est traité comme présent, pas comme un cache-miss", async () => {
  const redis = createFakeRedis();
  await redis.set("fxRate:EUR:MGA", 0);
  setRedisClient(redis);
  let called = false;
  await withFetch(
    async () => { called = true; return { ok: true, json: async () => ({}) }; },
    async () => {
      assert.equal(await getArPerEurRate(), 0);
    },
  );
  assert.equal(called, false, "0 en cache ne doit pas déclencher un nouvel appel réseau");
});

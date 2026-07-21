import { test } from "node:test";
import assert from "node:assert/strict";
import { setRedisClient } from "./redis.js";
import { createFakeRedis } from "./testFakeRedis.js";
import {
  IDX_ACCOUNTS,
  IDX_EXAMS,
  IDX_LAST_SEEN,
  IDX_PLAYS,
  IDX_TXNS,
  countAll,
  countBetween,
  entriesBetween,
  idsBetween,
  indexAccount,
  indexExam,
  indexPlay,
  indexTxn,
  playKey,
  touchLastSeen,
} from "./indexes.js";
import { getRedis } from "./redis.js";

const JOUR = 24 * 3600 * 1000;

test("indexe comptes, examens et transactions dans des index distincts", async () => {
  setRedisClient(createFakeRedis());
  await indexAccount("acc_1", 1000);
  await indexAccount("acc_2", 2000);
  await indexExam("ex_1", 1500);
  await indexTxn("txn_1", 1800);

  assert.equal(await countAll(IDX_ACCOUNTS), 2);
  assert.equal(await countAll(IDX_EXAMS), 1);
  assert.equal(await countAll(IDX_TXNS), 1);
  assert.equal(await countAll(IDX_PLAYS), 0, "index vide = 0, pas d'erreur");
});

test("countBetween respecte les bornes (incluses)", async () => {
  setRedisClient(createFakeRedis());
  await indexAccount("acc_1", 100);
  await indexAccount("acc_2", 200);
  await indexAccount("acc_3", 300);

  assert.equal(await countBetween(IDX_ACCOUNTS, 100, 300), 3);
  assert.equal(await countBetween(IDX_ACCOUNTS, 150, 250), 1);
  assert.equal(await countBetween(IDX_ACCOUNTS, 200, 200), 1, "bornes incluses");
  assert.equal(await countBetween(IDX_ACCOUNTS, 400, 500), 0);
});

test("idsBetween renvoie du plus récent au plus ancien et borne le volume", async () => {
  setRedisClient(createFakeRedis());
  const t0 = Date.now();
  await indexExam("ex_vieux", t0 - 3 * JOUR);
  await indexExam("ex_moyen", t0 - 2 * JOUR);
  await indexExam("ex_recent", t0 - 1 * JOUR);

  const tout = await idsBetween(IDX_EXAMS, t0 - 10 * JOUR, t0);
  assert.deepEqual(tout, ["ex_recent", "ex_moyen", "ex_vieux"]);

  const fenetre = await idsBetween(IDX_EXAMS, t0 - 2.5 * JOUR, t0);
  assert.deepEqual(fenetre, ["ex_recent", "ex_moyen"], "hors fenêtre exclu");

  const borne = await idsBetween(IDX_EXAMS, t0 - 10 * JOUR, t0, 2);
  assert.deepEqual(borne, ["ex_recent", "ex_moyen"], "limit respectée");
});

test("entriesBetween rend le score, pour bâtir les courbes", async () => {
  setRedisClient(createFakeRedis());
  await indexTxn("txn_a", 5000);
  await indexTxn("txn_b", 9000);

  assert.deepEqual(await entriesBetween(IDX_TXNS, 0, 10000), [
    { member: "txn_b", score: 9000 },
    { member: "txn_a", score: 5000 },
  ]);
});

test("touchLastSeen met à jour le score sans dupliquer le membre", async () => {
  setRedisClient(createFakeRedis());
  await touchLastSeen("acc_1", 1000);
  await touchLastSeen("acc_1", 5000);

  assert.equal(await countAll(IDX_LAST_SEEN), 1, "un seul membre");
  assert.equal(await getRedis().zscore(IDX_LAST_SEEN, "acc_1"), 5000);
});

test("touchLastSeen ignore un compte absent (hôte non connecté)", async () => {
  setRedisClient(createFakeRedis());
  await touchLastSeen(null);
  await touchLastSeen(undefined);
  assert.equal(await countAll(IDX_LAST_SEEN), 0);
});

test("indexPlay trace la partie et l'indexe — mode Libre et hôte invité compris", async () => {
  setRedisClient(createFakeRedis());
  await indexPlay({
    id: "play_1",
    code: "ABC123",
    mode: "libre",
    capacity: null,
    hostAccountId: null, // invité : personne à rattacher
    startedAt: 4242,
  });

  assert.equal(await countAll(IDX_PLAYS), 1);
  assert.deepEqual(await getRedis().get(playKey("play_1")), {
    id: "play_1",
    code: "ABC123",
    mode: "libre",
    capacity: null,
    hostAccountId: null,
    startedAt: 4242,
  });
});

test("une panne Redis n'échoue jamais : l'écriture d'index est avalée", async () => {
  // Garantie centrale : un formateur qui lance un quiz devant sa classe ne
  // doit pas être bloqué parce qu'une statistique n'a pas pu s'écrire.
  const casse = {
    async zadd() {
      throw new Error("redis indisponible");
    },
    async set() {
      throw new Error("redis indisponible");
    },
  };
  setRedisClient(casse);

  await assert.doesNotReject(() => indexAccount("acc_1", 1));
  await assert.doesNotReject(() => indexExam("ex_1", 1));
  await assert.doesNotReject(() => indexTxn("txn_1", 1));
  await assert.doesNotReject(() => touchLastSeen("acc_1", 1));
  await assert.doesNotReject(() =>
    indexPlay({ id: "play_1", code: "A", mode: "libre", startedAt: 1 }),
  );
});

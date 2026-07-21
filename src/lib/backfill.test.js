import { test } from "node:test";
import assert from "node:assert/strict";
import { setRedisClient, getRedis } from "./redis.js";
import { createFakeRedis } from "./testFakeRedis.js";
import { backfillIndexes } from "./backfill.js";
import {
  IDX_ACCOUNTS,
  IDX_EXAMS,
  IDX_LAST_SEEN,
  IDX_TXNS,
  countAll,
  idsBetween,
} from "./indexes.js";

// Les documents sont écrits DIRECTEMENT, sans passer par les fonctions de
// lib : c'est exactement la situation à rattraper — des données créées avant
// l'existence des index.
async function seed() {
  const r = getRedis();
  await r.set("account:acc_1", { id: "acc_1", email: "a@x.fr", createdAt: 1000 });
  await r.set("account:acc_2", { id: "acc_2", email: "b@x.fr", createdAt: 2000 });
  // Piège : même préfixe textuel, autre famille de clés (email → id).
  await r.set("accountEmail:a@x.fr", "acc_1");

  await r.set("examRecord:ex_1", { id: "ex_1", accountId: "acc_1", endedAt: 5000 });
  await r.set("examRecord:ex_2", { id: "ex_2", accountId: "acc_1", endedAt: 9000 });
  await r.set("examRecord:ex_3", { id: "ex_3", accountId: "acc_2", endedAt: 7000 });

  await r.set("txn:txn_1", { id: "txn_1", accountId: "acc_1", createdAt: 3000 });
}

test("reconstruit les index depuis les données antérieures", async () => {
  setRedisClient(createFakeRedis());
  await seed();

  const rapport = await backfillIndexes();

  assert.equal(await countAll(IDX_ACCOUNTS), 2);
  assert.equal(await countAll(IDX_EXAMS), 3);
  assert.equal(await countAll(IDX_TXNS), 1);
  assert.equal(rapport.accounts.indexed, 2);
  assert.equal(rapport.exams.indexed, 3);
  assert.equal(rapport.txns.indexed, 1);
});

test("le motif « account:* » n'attrape pas « accountEmail:* »", async () => {
  // Sans les deux-points, le rattrapage indexerait des chaînes d'email et
  // fausserait le nombre de comptes.
  setRedisClient(createFakeRedis());
  await seed();
  await backfillIndexes();

  const ids = await idsBetween(IDX_ACCOUNTS, 0, Date.now());
  assert.deepEqual(ids.sort(), ["acc_1", "acc_2"]);
});

test("déduit la dernière activité du dernier examen de chaque compte", async () => {
  setRedisClient(createFakeRedis());
  await seed();
  await backfillIndexes();

  const r = getRedis();
  assert.equal(await r.zscore(IDX_LAST_SEEN, "acc_1"), 9000, "le plus récent des deux");
  assert.equal(await r.zscore(IDX_LAST_SEEN, "acc_2"), 7000);
});

test("ne fait jamais régresser une activité plus récente déjà connue", async () => {
  setRedisClient(createFakeRedis());
  await seed();
  // Le compte s'est connecté aujourd'hui : son dernier examen date d'avant.
  await getRedis().zadd(IDX_LAST_SEEN, { score: 999999, member: "acc_1" });

  await backfillIndexes();

  assert.equal(
    await getRedis().zscore(IDX_LAST_SEEN, "acc_1"),
    999999,
    "la connexion récente prime sur le vieil examen",
  );
});

test("la simulation compte tout et n'écrit rien", async () => {
  setRedisClient(createFakeRedis());
  await seed();

  const rapport = await backfillIndexes({ dryRun: true });

  assert.equal(rapport.dryRun, true);
  assert.equal(rapport.accounts.indexed, 2, "compté");
  assert.equal(rapport.lastSeen, 2);
  assert.equal(await countAll(IDX_ACCOUNTS), 0, "mais rien écrit");
  assert.equal(await countAll(IDX_EXAMS), 0);
  assert.equal(await countAll(IDX_TXNS), 0);
  assert.equal(await countAll(IDX_LAST_SEEN), 0);
});

test("rejouable : deux passages donnent le même résultat", async () => {
  setRedisClient(createFakeRedis());
  await seed();

  await backfillIndexes();
  await backfillIndexes();

  assert.equal(await countAll(IDX_ACCOUNTS), 2, "pas de doublon");
  assert.equal(await countAll(IDX_EXAMS), 3);
  assert.equal(await getRedis().zscore(IDX_EXAMS, "ex_2"), 9000);
});

test("signale les clés orphelines et les documents sans date", async () => {
  setRedisClient(createFakeRedis());
  const r = getRedis();
  await r.set("account:acc_ok", { id: "acc_ok", createdAt: 1000 });
  await r.set("account:acc_sans_date", { id: "acc_sans_date" });
  await r.set("account:acc_vide", null);

  const rapport = await backfillIndexes();

  assert.equal(rapport.accounts.sansDate, 1);
  assert.equal(rapport.accounts.orphelins, 1, "document illisible ignoré");
  assert.equal(
    await countAll(IDX_ACCOUNTS),
    2,
    "le compte sans date reste compté dans le total",
  );
});

test("ne bronche pas sur une base vide", async () => {
  setRedisClient(createFakeRedis());
  const rapport = await backfillIndexes();
  assert.equal(rapport.accounts.indexed, 0);
  assert.equal(rapport.lastSeen, 0);
});

test("parcourt au-delà d'un seul lot de SCAN", async () => {
  // Le curseur doit être suivi jusqu'à épuisement : sinon seuls les premiers
  // comptes seraient rattrapés, en silence.
  setRedisClient(createFakeRedis());
  const r = getRedis();
  for (let i = 0; i < 450; i++) {
    await r.set(`account:acc_${i}`, { id: `acc_${i}`, createdAt: 1000 + i });
  }

  const rapport = await backfillIndexes();

  assert.equal(rapport.accounts.indexed, 450);
  assert.equal(await countAll(IDX_ACCOUNTS), 450);
});

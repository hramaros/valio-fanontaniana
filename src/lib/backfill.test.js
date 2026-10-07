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
import {
  listExamRecords,
  getClassExamRecords,
  countExamRecords,
} from "./history.js";
import { listTransactions, countTransactions } from "./payments.js";

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

// — Index par compte et par classe —
//
// Ils remplacent les listes `examHistory:` / `classExams:` plafonnées à 200.
// Le rattrapage doit les reconstruire sans second SCAN, depuis la passe
// `examRecord:*` qui tient déjà `accountId`, `classId` et `endedAt`.

test("reconstruit les index d'examens par compte et par classe", async () => {
  setRedisClient(createFakeRedis());
  const r = getRedis();
  await r.set("examRecord:ex_1", {
    id: "ex_1",
    accountId: "acc_1",
    classId: "cl_1",
    endedAt: 5000,
  });
  await r.set("examRecord:ex_2", {
    id: "ex_2",
    accountId: "acc_1",
    classId: "cl_1",
    endedAt: 9000,
  });
  await r.set("examRecord:ex_3", { id: "ex_3", accountId: "acc_2", endedAt: 7000 });

  const rapport = await backfillIndexes();

  assert.deepEqual(rapport.examsParCompte, { keys: 2, entries: 3 });
  assert.deepEqual(rapport.examsParClasse, { keys: 1, entries: 2 });

  // Lecture par l'API métier : c'est elle qui compte, pas la forme de la clé.
  const list = await listExamRecords("acc_1");
  assert.deepEqual(
    list.map((x) => x.id),
    ["ex_2", "ex_1"],
    "du plus récent au plus ancien",
  );
  assert.equal((await listExamRecords("acc_2")).length, 1);

  const carnet = await getClassExamRecords("cl_1");
  assert.deepEqual(
    carnet.map((x) => x.id),
    ["ex_1", "ex_2"],
    "carnet en ordre chronologique",
  );
});

test("migre une liste héritée vers le ZSET, au-delà de son plafond", async () => {
  setRedisClient(createFakeRedis());
  const r = getRedis();
  // 205 examens archivés : l'ancienne liste n'en référençait que 200, les cinq
  // premiers n'étaient plus joignables. Les documents, eux, sont tous là —
  // c'est précisément ce que le rattrapage récupère.
  for (let i = 1; i <= 205; i++) {
    await r.set(`examRecord:ex_${i}`, {
      id: `ex_${i}`,
      accountId: "acc_1",
      endedAt: i * 1000,
    });
    if (i > 5) await r.lpush("examHistory:acc_1", `ex_${i}`);
  }

  await backfillIndexes();

  assert.equal(await countExamRecords("acc_1"), 205);
  const page = await listExamRecords("acc_1", 200);
  const suite = await listExamRecords("acc_1", 50, {
    before: page[page.length - 1].endedAt,
  });
  assert.equal(suite.length, 5);
  assert.equal(
    suite[suite.length - 1].id,
    "ex_1",
    "le premier examen, évincé de l'ancienne liste, redevient joignable",
  );
});

test("la simulation n'écrit pas les index par compte", async () => {
  setRedisClient(createFakeRedis());
  await seed();

  const rapport = await backfillIndexes({ dryRun: true });

  assert.equal(rapport.examsParCompte.entries, 3, "compté");
  assert.equal((await listExamRecords("acc_1")).length, 0, "mais rien écrit");
});

test("reconstruit l'index des recharges par compte", async () => {
  setRedisClient(createFakeRedis());
  const r = getRedis();
  await r.set("txn:t1", { id: "t1", accountId: "acc_1", createdAt: 1000, amountAr: 5000 });
  await r.set("txn:t2", { id: "t2", accountId: "acc_1", createdAt: 3000, amountAr: 9000 });
  await r.set("txn:t3", { id: "t3", accountId: "acc_2", createdAt: 2000, amountAr: 1000 });
  // Piège : même préfixe textuel, autre famille de clés.
  await r.lpush("txnHistory:acc_9", "t_fantome");

  const rapport = await backfillIndexes();

  assert.deepEqual(rapport.txnsParCompte, { keys: 2, entries: 3 });
  assert.equal(rapport.txns.indexed, 3, "`txn:*` n'attrape pas `txnHistory:*`");

  const list = await listTransactions("acc_1");
  assert.deepEqual(
    list.map((t) => t.id),
    ["t2", "t1"],
    "du plus récent au plus ancien",
  );
  assert.equal(await countTransactions("acc_1"), 2);
});

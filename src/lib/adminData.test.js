import { test } from "node:test";
import assert from "node:assert/strict";
import { setRedisClient, getRedis } from "./redis.js";
import { createFakeRedis } from "./testFakeRedis.js";
import {
  indexAccount,
  indexExam,
  indexTxn,
  indexPlay,
  touchLastSeen,
} from "./indexes.js";
import { overviewData } from "./adminData.js";

const DAY = 86400000;
const NOW = Date.parse("2026-07-31T12:00:00Z");

// Reconstitue un état complet — documents ET index — comme en production.
async function seed() {
  const r = getRedis();

  // 2 comptes : A actif récent, B ancien et inactif.
  await r.set("account:A", { id: "A", email: "a@x.mg", provider: "password", balanceAr: 5000, createdAt: NOW - 5 * DAY });
  await r.set("account:B", { id: "B", email: "b@x.mg", provider: "google", balanceAr: 0, createdAt: NOW - 40 * DAY });
  await indexAccount("A", NOW - 5 * DAY);
  await indexAccount("B", NOW - 40 * DAY);
  await touchLastSeen("A", NOW - 2 * DAY); // actif 30 j
  await touchLastSeen("B", NOW - 40 * DAY); // hors 30 j

  // Examens : ex1 dans la fenêtre courante ; ex2/ex3 dans la précédente.
  const exam = (id, o) => r.set(`examRecord:${id}`, { id, ...o });
  await exam("ex1", { accountId: "A", charged: true, priceAr: 1000, participantCount: 10, avgNote: 12, mode: "examen", capacity: "small", endedAt: NOW - 3 * DAY });
  await exam("ex2", { accountId: "A", charged: true, priceAr: 2000, participantCount: 5, avgNote: 14, mode: "examen", capacity: "unlimited", endedAt: NOW - 40 * DAY });
  await exam("ex3", { accountId: "B", charged: false, priceAr: 1000, participantCount: 3, avgNote: 8, mode: "examen", capacity: "small", endedAt: NOW - 45 * DAY });
  await indexExam("ex1", NOW - 3 * DAY);
  await indexExam("ex2", NOW - 40 * DAY);
  await indexExam("ex3", NOW - 45 * DAY);

  // Recharges : deux payeurs distincts confirmés, une en attente.
  const txn = (id, o) => r.set(`txn:${id}`, { id, ...o });
  await txn("t1", { accountId: "A", status: "completed", amountAr: 5000, createdAt: NOW - 2 * DAY, completedAt: NOW - 2 * DAY });
  await txn("t2", { accountId: "A", status: "completed", amountAr: 5000, createdAt: NOW - 4 * DAY, completedAt: NOW - 4 * DAY });
  await txn("t3", { accountId: "B", status: "completed", amountAr: 2000, createdAt: NOW - 6 * DAY, completedAt: NOW - 6 * DAY });
  await txn("t4", { accountId: "B", status: "pending", amountAr: 9999, createdAt: NOW - 1 * DAY, completedAt: null });
  for (const [id, at] of [["t1", NOW - 2 * DAY], ["t2", NOW - 4 * DAY], ["t3", NOW - 6 * DAY], ["t4", NOW - 1 * DAY]]) {
    await indexTxn(id, at);
  }

  // Parties : 3 Libre + 1 Examen dans la fenêtre.
  await indexPlay({ id: "p1", code: "AAA", mode: "libre", hostAccountId: null, startedAt: NOW - 1 * DAY });
  await indexPlay({ id: "p2", code: "BBB", mode: "libre", hostAccountId: null, startedAt: NOW - 2 * DAY });
  await indexPlay({ id: "p3", code: "CCC", mode: "libre", hostAccountId: "A", startedAt: NOW - 3 * DAY });
  await indexPlay({ id: "p4", code: "DDD", mode: "examen", hostAccountId: "A", startedAt: NOW - 3 * DAY });
}

test("overviewData : stocks (tout l'historique)", async () => {
  setRedisClient(createFakeRedis());
  await seed();
  const o = await overviewData({ now: NOW, days: 30 });

  assert.equal(o.stock.comptesInscrits, 2);
  assert.equal(o.stock.passifPrepaidAr, 5000, "somme des soldes");
  assert.deepEqual(o.stock.providerMix, { password: 1, google: 1 });
  assert.equal(o.stock.actifs30j, 1, "seul A a été actif dans les 30 j");
});

test("overviewData : revenu (fenêtre courante)", async () => {
  setRedisClient(createFakeRedis());
  await seed();
  const o = await overviewData({ now: NOW, days: 30 });

  assert.equal(o.revenu.encaisseAr, 12000, "3 recharges confirmées, la pending exclue");
  assert.equal(o.revenu.consommeAr, 1000, "seul ex1 (fenêtre) est débité");
  assert.equal(o.revenu.clientsPayants, 2);
  assert.equal(o.revenu.arpuPayantAr, 6000, "12000 / 2 payeurs");
  assert.equal(o.revenu.panierMoyenAr, 1000);
});

test("overviewData : usage et entonnoir", async () => {
  setRedisClient(createFakeRedis());
  await seed();
  const o = await overviewData({ now: NOW, days: 30 });

  assert.equal(o.usage.examens, 1, "un seul examen dans la fenêtre");
  assert.equal(o.usage.participants, 10);
  assert.equal(o.usage.noteMoyenne, 12);
  assert.deepEqual(o.usage.funnel, { libre: 3, examen: 1, total: 4, conversion: 0.25 });
  assert.deepEqual(o.usage.capacityMix, { small: 1, unlimited: 0 });
});

test("overviewData : churn sur deux fenêtres", async () => {
  setRedisClient(createFakeRedis());
  await seed();
  const o = await overviewData({ now: NOW, days: 30 });

  // A : examen avant (ex2) ET pendant (ex1) → retenu. B : avant seulement → perdu.
  assert.equal(o.churn.actifsAvant, 2);
  assert.equal(o.churn.retenus, 1);
  assert.equal(o.churn.perdus, 1);
  assert.equal(o.churn.taux, 0.5);
});

test("overviewData : les séries couvrent la fenêtre entière (jours vides à 0)", async () => {
  setRedisClient(createFakeRedis());
  await seed();
  const o = await overviewData({ now: NOW, days: 30 });

  assert.equal(o.revenu.encaisseSeries.length, 31, "30 jours + aujourd'hui, bornes incluses");
  const totalSerie = o.revenu.encaisseSeries.reduce((s, p) => s + p.value, 0);
  assert.equal(totalSerie, 12000, "la série encaissée somme au même total");
});

test("overviewData : base vide ne bronche pas", async () => {
  setRedisClient(createFakeRedis());
  const o = await overviewData({ now: NOW, days: 30 });

  assert.equal(o.stock.comptesInscrits, 0);
  assert.equal(o.revenu.encaisseAr, 0);
  assert.equal(o.usage.funnel.total, 0);
  assert.equal(o.churn.actifsAvant, 0);
  assert.equal(o.revenu.encaisseSeries.length, 31);
});

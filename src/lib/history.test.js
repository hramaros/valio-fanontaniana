import { test } from "node:test";
import assert from "node:assert/strict";
import { setRedisClient } from "./redis.js";
import { createFakeRedis } from "./testFakeRedis.js";
import {
  saveExamRecord,
  listExamRecords,
  getExamRecord,
  getClassExamRecords,
  getExamRecordByVerifyCode,
} from "./history.js";

function rec(id, accountId, extra = {}) {
  return {
    id,
    accountId,
    code: "ABC123",
    title: "Exam " + id,
    mode: "examen",
    capacity: "small",
    priceAr: 1000,
    charged: true,
    nbQuestions: 1,
    participantCount: 2,
    endedAt: Date.now(),
    leaderboard: [{ pseudo: "Alice", score: 900, note: 20, rank: 1, nbCorrect: 1 }],
    podium: [],
    ...extra,
  };
}

test("saveExamRecord puis listExamRecords (plus récent en tête, résumé)", async () => {
  setRedisClient(createFakeRedis());
  await saveExamRecord(rec("ex1", "acc1"));
  await saveExamRecord(rec("ex2", "acc1"));
  const list = await listExamRecords("acc1");
  assert.equal(list.length, 2);
  assert.equal(list[0].id, "ex2"); // dernier sauvegardé en premier
  assert.equal(list[0].title, "Exam ex2");
  assert.equal(list[0].leaderboard, undefined); // résumé seulement
});

test("getExamRecord respecte l'appartenance au compte", async () => {
  setRedisClient(createFakeRedis());
  await saveExamRecord(rec("ex1", "acc1"));
  assert.equal((await getExamRecord("acc1", "ex1")).id, "ex1");
  assert.equal((await getExamRecord("acc1", "ex1")).leaderboard.length, 1);
  assert.equal(await getExamRecord("acc2", "ex1"), null); // autre compte
  assert.equal(await getExamRecord("acc1", "inconnu"), null);
});

test("historique isolé par compte", async () => {
  setRedisClient(createFakeRedis());
  await saveExamRecord(rec("ex1", "acc1"));
  await saveExamRecord(rec("ex2", "acc2"));
  assert.equal((await listExamRecords("acc1")).length, 1);
  assert.equal((await listExamRecords("acc2")).length, 1);
});

test("saveExamRecord génère un code de consultation + index public", async () => {
  setRedisClient(createFakeRedis());
  await saveExamRecord(rec("ex1", "acc1"));

  const record = await getExamRecord("acc1", "ex1");
  assert.match(record.verifyCode, /^VF-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  // La liste (résumé) expose le code côté formateur.
  const [summary] = await listExamRecords("acc1");
  assert.equal(summary.verifyCode, record.verifyCode);

  // Consultation publique : normalisation tolérante (minuscules, sans tirets).
  const relaxed = record.verifyCode.toLowerCase().replaceAll("-", "");
  const found = await getExamRecordByVerifyCode(relaxed);
  assert.equal(found.id, "ex1");
});

test("getExamRecordByVerifyCode : code inconnu ou invalide → null", async () => {
  setRedisClient(createFakeRedis());
  await saveExamRecord(rec("ex1", "acc1"));
  assert.equal(await getExamRecordByVerifyCode("VF-AAAA-AAAA"), null);
  assert.equal(await getExamRecordByVerifyCode("pas-un-code"), null);
  assert.equal(await getExamRecordByVerifyCode(""), null);
});

test("rattrapage paresseux : un ancien record sans code en reçoit un à la lecture", async () => {
  const redis = createFakeRedis();
  setRedisClient(redis);
  // Record « historique » écrit avant la fonctionnalité (sans verifyCode).
  await redis.set("examRecord:ex0", rec("ex0", "acc1", { classId: "c1" }));
  await redis.lpush("examHistory:acc1", "ex0");
  await redis.lpush("classExams:c1", "ex0");

  const [summary] = await listExamRecords("acc1");
  assert.match(summary.verifyCode, /^VF-/);

  // Le code est persisté (pas régénéré à chaque lecture) et indexé.
  const again = await getExamRecord("acc1", "ex0");
  assert.equal(again.verifyCode, summary.verifyCode);
  assert.equal((await getExamRecordByVerifyCode(summary.verifyCode)).id, "ex0");

  // Le carnet de notes (records de classe) le voit aussi.
  const [classRec] = await getClassExamRecords("c1");
  assert.equal(classRec.verifyCode, summary.verifyCode);
});

test("index par classe : getClassExamRecords (ordre chronologique)", async () => {
  setRedisClient(createFakeRedis());
  await saveExamRecord(rec("ex1", "acc1", { classId: "c1" }));
  await saveExamRecord(rec("ex2", "acc1", { classId: "c1" }));
  await saveExamRecord(rec("ex3", "acc1", { classId: "c2" }));

  const c1 = await getClassExamRecords("c1");
  assert.equal(c1.length, 2);
  assert.equal(c1[0].id, "ex1"); // plus ancien d'abord
  assert.equal(c1[1].id, "ex2");
  assert.equal((await getClassExamRecords("c2")).length, 1);
  assert.equal((await getClassExamRecords("inexistante")).length, 0);
});

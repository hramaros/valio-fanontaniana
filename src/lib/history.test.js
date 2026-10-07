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
  countExamRecords,
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
  await saveExamRecord(rec("ex1", "acc1", { endedAt: 1000 }));
  await saveExamRecord(rec("ex2", "acc1", { endedAt: 2000 }));
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
  await saveExamRecord(rec("ex1", "acc1", { classId: "c1", endedAt: 1000 }));
  await saveExamRecord(rec("ex2", "acc1", { classId: "c1", endedAt: 2000 }));
  await saveExamRecord(rec("ex3", "acc1", { classId: "c2", endedAt: 3000 }));

  const c1 = await getClassExamRecords("c1");
  assert.equal(c1.length, 2);
  assert.equal(c1[0].id, "ex1"); // plus ancien d'abord
  assert.equal(c1[1].id, "ex2");
  assert.equal((await getClassExamRecords("c2")).length, 1);
  assert.equal((await getClassExamRecords("inexistante")).length, 0);
});

// — Le bug corrigé : la troncature à 200 —
//
// `examHistory:` / `classExams:` étaient des listes `LPUSH` + `LTRIM 0 199`.
// Comme les documents `examRecord:*` n'ont pas de TTL, le 201e examen ne
// libérait rien : il rendait le premier inatteignable. Ces tests verrouillent
// la propriété qui manquait — au-delà de 200, on perd l'accès à rien.

test("au-delà de 200 examens, aucun ne devient inaccessible", async () => {
  setRedisClient(createFakeRedis());
  const TOTAL = 205;
  for (let i = 1; i <= TOTAL; i++) {
    await saveExamRecord(rec(`ex${i}`, "acc1", { endedAt: i * 1000 }));
  }

  assert.equal(await countExamRecords("acc1"), TOTAL);

  // Parcours complet par curseur, page par page.
  const vus = [];
  let before;
  for (;;) {
    const page = await listExamRecords("acc1", 50, { before });
    if (page.length === 0) break;
    vus.push(...page.map((r) => r.id));
    before = page[page.length - 1].endedAt;
  }

  assert.equal(vus.length, TOTAL, "tous les examens doivent rester atteignables");
  assert.equal(new Set(vus).size, TOTAL, "aucun doublon entre les pages");
  assert.equal(vus[0], `ex${TOTAL}`); // plus récent d'abord
  assert.equal(vus[vus.length - 1], "ex1"); // le tout premier, jadis perdu
});

test("pagination par curseur : pages jointives, sans trou ni recouvrement", async () => {
  setRedisClient(createFakeRedis());
  for (let i = 1; i <= 10; i++) {
    await saveExamRecord(rec(`ex${i}`, "acc1", { endedAt: i * 1000 }));
  }

  const p1 = await listExamRecords("acc1", 4);
  assert.deepEqual(
    p1.map((r) => r.id),
    ["ex10", "ex9", "ex8", "ex7"],
  );

  // Le curseur est exclusif : ex7 ne doit pas réapparaître.
  const p2 = await listExamRecords("acc1", 4, { before: p1[p1.length - 1].endedAt });
  assert.deepEqual(
    p2.map((r) => r.id),
    ["ex6", "ex5", "ex4", "ex3"],
  );

  const p3 = await listExamRecords("acc1", 4, { before: p2[p2.length - 1].endedAt });
  assert.deepEqual(
    p3.map((r) => r.id),
    ["ex2", "ex1"],
  );
  assert.equal((await listExamRecords("acc1", 4, { before: 1000 })).length, 0);
});

test("un carnet de classe garde plus de 200 examens", async () => {
  setRedisClient(createFakeRedis());
  for (let i = 1; i <= 210; i++) {
    await saveExamRecord(rec(`ex${i}`, "acc1", { classId: "c1", endedAt: i * 1000 }));
  }
  // Page bornée à 200, mais le plus ancien reste joignable par curseur —
  // avant, il avait été évincé de la liste et n'existait plus pour personne.
  const page = await getClassExamRecords("c1");
  assert.equal(page.length, 200);
  const suite = await getClassExamRecords("c1", 50, { before: page[0].endedAt });
  assert.equal(suite.length, 10);
  assert.equal(suite[0].id, "ex1");
});

test("transition : les entrées héritées et les nouvelles cohabitent", async () => {
  const redis = createFakeRedis();
  setRedisClient(redis);
  // Deux examens anciens, visibles seulement par les listes héritées (ce que
  // laisse une base déployée avant la bascule et pas encore rattrapée).
  await redis.set("examRecord:vieux1", rec("vieux1", "acc1", { endedAt: 1000, classId: "c1" }));
  await redis.set("examRecord:vieux2", rec("vieux2", "acc1", { endedAt: 2000, classId: "c1" }));
  await redis.lpush("examHistory:acc1", "vieux1");
  await redis.lpush("examHistory:acc1", "vieux2");
  await redis.lpush("classExams:c1", "vieux1");
  await redis.lpush("classExams:c1", "vieux2");

  // Un examen postérieur à la bascule, écrit dans le ZSET.
  await saveExamRecord(rec("neuf", "acc1", { endedAt: 3000, classId: "c1" }));

  const list = await listExamRecords("acc1");
  assert.deepEqual(
    list.map((r) => r.id),
    ["neuf", "vieux2", "vieux1"],
    "aucun examen ne doit disparaître pendant la transition",
  );

  const carnet = await getClassExamRecords("c1");
  assert.deepEqual(
    carnet.map((r) => r.id),
    ["vieux1", "vieux2", "neuf"],
  );
});

test("curseur : une page finissant sur des ex æquo n'en perd aucun", async () => {
  setRedisClient(createFakeRedis());
  // Cinq examens à la MÊME milliseconde : un curseur qui ne porterait que la
  // date écarterait tout le groupe d'un coup et en perdrait trois.
  for (let i = 1; i <= 5; i++) {
    await saveExamRecord(rec(`ex${i}`, "acc1", { endedAt: 1000 }));
  }

  const vus = [];
  let before;
  let afterId;
  for (let garde = 0; garde < 10; garde++) {
    const page = await listExamRecords("acc1", 2, { before, afterId });
    if (page.length === 0) break;
    vus.push(...page.map((r) => r.id));
    const dernier = page[page.length - 1];
    before = dernier.endedAt;
    afterId = dernier.id;
  }

  assert.equal(new Set(vus).size, 5, "les cinq ex æquo doivent être atteints");
  assert.equal(vus.length, 5, "et une seule fois chacun");
});

test("curseur sans afterId : tout ce qui précède strictement la date", async () => {
  setRedisClient(createFakeRedis());
  await saveExamRecord(rec("a", "acc1", { endedAt: 1000 }));
  await saveExamRecord(rec("b", "acc1", { endedAt: 1000 }));
  await saveExamRecord(rec("c", "acc1", { endedAt: 500 }));

  const page = await listExamRecords("acc1", 10, { before: 1000 });
  assert.deepEqual(
    page.map((r) => r.id),
    ["c"],
    "les deux ex æquo de 1000 sont exclus, pas seulement un",
  );
});

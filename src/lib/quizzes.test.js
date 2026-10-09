import { test } from "node:test";
import assert from "node:assert/strict";
import { setRedisClient } from "./redis.js";
import { createFakeRedis } from "./testFakeRedis.js";
import {
  createQuiz,
  getQuiz,
  updateQuiz,
  listQuizzes,
  countQuizzes,
  deleteQuiz,
  duplicateQuiz,
  markQuizUsed,
  MAX_QUIZZES_PER_ACCOUNT,
  quizAcctKey,
} from "./quizzes.js";

const quiz = (extra = {}) => ({
  title: "Contrôle de géométrie",
  mode: "examen",
  capacity: "small",
  totalDurationSec: 600,
  questions: [
    {
      text: "Combien de côtés a un hexagone ?",
      type: "single",
      basePoints: 1000,
      answers: [
        { text: "6", color: "#fff", correct: true },
        { text: "8", color: "#fff", correct: false },
      ],
    },
  ],
  ...extra,
});

test("createQuiz enregistre, puis listQuizzes rend un résumé", async () => {
  setRedisClient(createFakeRedis());
  const { ok, quiz: saved } = await createQuiz("acc1", quiz());
  assert.equal(ok, true);
  assert.match(saved.id, /^qz/);
  assert.equal(saved.accountId, "acc1");
  assert.equal(saved.source, "manuel");
  assert.equal(saved.usageCount, 0);

  const [resume] = await listQuizzes("acc1");
  assert.equal(resume.id, saved.id);
  assert.equal(resume.title, "Contrôle de géométrie");
  assert.equal(resume.questionCount, 1);
  assert.equal(
    resume.questions,
    undefined,
    "la liste ne transporte pas les questions",
  );
});

test("createQuiz applique la validation de rooms.js", async () => {
  setRedisClient(createFakeRedis());
  // Une question à choix sans bonne réponse : c'est exactement ce que produit
  // un Google Form qui n'est pas configuré en quiz.
  const sansBonneReponse = quiz({
    questions: [
      {
        text: "Votre couleur préférée ?",
        type: "single",
        answers: [
          { text: "Bleu", correct: false },
          { text: "Rouge", correct: false },
        ],
      },
    ],
  });
  const r = await createQuiz("acc1", sansBonneReponse);
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.match(r.error, /bonne réponse/);
  assert.equal(await countQuizzes("acc1"), 0, "rien n'est enregistré");
});

test("createQuiz : un type à saisie libre impose le mode Examen", async () => {
  setRedisClient(createFakeRedis());
  const r = await createQuiz(
    "acc1",
    quiz({
      mode: "libre",
      questions: [
        { text: "Capitale ?", type: "short", accepted: ["Antananarivo"] },
      ],
    }),
  );
  assert.equal(r.ok, false);
  assert.match(r.error, /mode Examen/);
});

test("getQuiz et updateQuiz respectent l'appartenance au compte", async () => {
  setRedisClient(createFakeRedis());
  const { quiz: saved } = await createQuiz("acc1", quiz());

  assert.equal((await getQuiz("acc1", saved.id)).id, saved.id);
  assert.equal(await getQuiz("acc2", saved.id), null, "autre compte");
  assert.equal(await getQuiz("acc1", "qz_inconnu"), null);

  const vol = await updateQuiz("acc2", saved.id, quiz({ title: "Détourné" }));
  assert.equal(vol.ok, false);
  assert.equal(vol.status, 404);
  assert.equal((await getQuiz("acc1", saved.id)).title, "Contrôle de géométrie");
});

test("updateQuiz ne laisse pas le client réécrire identité, origine ni usage", async () => {
  setRedisClient(createFakeRedis());
  const { quiz: saved } = await createQuiz("acc1", quiz(), {
    source: "google-forms",
    sourceUrl: "https://docs.google.com/forms/d/e/ABC/viewform",
  });
  await markQuizUsed("acc1", saved.id);

  const { ok, quiz: maj } = await updateQuiz("acc1", saved.id, {
    ...quiz({ title: "Révisé" }),
    id: "qz_pirate",
    accountId: "acc2",
    source: "manuel",
    sourceUrl: "https://ailleurs.example",
    usageCount: 999,
    createdAt: 0,
  });

  assert.equal(ok, true);
  assert.equal(maj.title, "Révisé", "le contenu est bien modifié");
  assert.equal(maj.id, saved.id);
  assert.equal(maj.accountId, "acc1");
  assert.equal(maj.source, "google-forms", "l'origine est immuable");
  assert.equal(maj.sourceUrl, saved.sourceUrl);
  assert.equal(maj.usageCount, 1, "le compteur d'usage n'est pas réécrit");
  assert.equal(maj.createdAt, saved.createdAt);
  assert.ok(maj.updatedAt >= saved.updatedAt);
});

test("la bibliothèque se lit du plus récemment modifié au plus ancien", async () => {
  setRedisClient(createFakeRedis());
  const vraiNow = Date.now;
  let t = vraiNow.call(Date);
  Date.now = () => (t += 1000);
  try {
    const a = await createQuiz("acc1", quiz({ title: "A" }));
    await createQuiz("acc1", quiz({ title: "B" }));
    // A est modifié après B : il doit repasser devant.
    await updateQuiz("acc1", a.quiz.id, quiz({ title: "A révisé" }));
  } finally {
    Date.now = vraiNow;
  }

  const titres = (await listQuizzes("acc1")).map((q) => q.title);
  assert.deepEqual(titres, ["A révisé", "B"]);
});

test("lancer un quiz ne le fait pas remonter dans la bibliothèque", async () => {
  setRedisClient(createFakeRedis());
  const vraiNow = Date.now;
  let t = vraiNow.call(Date);
  Date.now = () => (t += 1000);
  try {
    const a = await createQuiz("acc1", quiz({ title: "A" }));
    await createQuiz("acc1", quiz({ title: "B" }));
    await markQuizUsed("acc1", a.quiz.id);
  } finally {
    Date.now = vraiNow;
  }

  const liste = await listQuizzes("acc1");
  assert.deepEqual(
    liste.map((q) => q.title),
    ["B", "A"],
    "utiliser n'est pas modifier",
  );
  assert.equal(liste[1].usageCount, 1);
  assert.ok(liste[1].lastUsedAt > 0);
});

test("deleteQuiz retire de l'index et libère la place", async () => {
  setRedisClient(createFakeRedis());
  const { quiz: saved } = await createQuiz("acc1", quiz());
  assert.equal(await countQuizzes("acc1"), 1);

  assert.equal((await deleteQuiz("acc2", saved.id)).status, 404, "autre compte");
  assert.equal((await deleteQuiz("acc1", saved.id)).ok, true);

  assert.equal(await countQuizzes("acc1"), 0);
  assert.equal(await getQuiz("acc1", saved.id), null);
  assert.deepEqual(await listQuizzes("acc1"), [], "plus d'entrée fantôme");
});

test("duplicateQuiz régénère les identifiants de questions et réponses", async () => {
  setRedisClient(createFakeRedis());
  const { quiz: saved } = await createQuiz("acc1", quiz());
  const { ok, quiz: copie } = await duplicateQuiz("acc1", saved.id);

  assert.equal(ok, true);
  assert.equal(copie.title, "Contrôle de géométrie (copie)");
  assert.notEqual(copie.id, saved.id);
  assert.notEqual(
    copie.questions[0].id,
    saved.questions[0].id,
    "deux quiz ne doivent pas partager un id de question",
  );
  assert.notEqual(
    copie.questions[0].answers[0].id,
    saved.questions[0].answers[0].id,
  );
  assert.equal(copie.usageCount, 0, "la copie repart à zéro");
  assert.equal(await countQuizzes("acc1"), 2);
});

test("duplicateQuiz conserve l'origine de l'import", async () => {
  setRedisClient(createFakeRedis());
  const { quiz: saved } = await createQuiz("acc1", quiz(), {
    source: "google-forms",
    sourceUrl: "https://docs.google.com/forms/d/e/ABC/viewform",
  });
  const { quiz: copie } = await duplicateQuiz("acc1", saved.id);
  assert.equal(copie.source, "google-forms");
  assert.equal(copie.sourceUrl, saved.sourceUrl);
});

test("plafond par compte : refus explicite à la création, pas de troncature", async () => {
  const redis = createFakeRedis();
  setRedisClient(redis);
  // On remplit l'index directement : créer 200 quiz pour tester une borne
  // serait du temps de test gaspillé.
  for (let i = 0; i < MAX_QUIZZES_PER_ACCOUNT; i++) {
    await redis.zadd(quizAcctKey("acc1"), { score: i, member: `qz_${i}` });
  }

  const r = await createQuiz("acc1", quiz());
  assert.equal(r.ok, false);
  assert.equal(r.status, 409);
  assert.match(r.error, /Limite de 200 quiz/);
  assert.equal(
    await countQuizzes("acc1"),
    MAX_QUIZZES_PER_ACCOUNT,
    "aucune entrée évincée en silence",
  );
});

test("bibliothèque isolée par compte", async () => {
  setRedisClient(createFakeRedis());
  await createQuiz("acc1", quiz({ title: "Chez moi" }));
  await createQuiz("acc2", quiz({ title: "Chez l'autre" }));
  assert.deepEqual(
    (await listQuizzes("acc1")).map((q) => q.title),
    ["Chez moi"],
  );
  assert.equal(await countQuizzes("acc2"), 1);
});

test("markQuizUsed n'échoue jamais sur un quiz inconnu", async () => {
  setRedisClient(createFakeRedis());
  assert.equal(await markQuizUsed("acc1", "qz_inconnu"), null);
});

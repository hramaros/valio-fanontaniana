import { test } from "node:test";
import assert from "node:assert/strict";
import { setRedisClient } from "./redis.js";
import { createFakeRedis } from "./testFakeRedis.js";
import {
  createRoom,
  setQuiz,
  startGame,
  joinRoom,
  registerPlayer,
  revealQuestion,
  submitAnswer,
  getLeaderboard,
  getMe,
  getMeta,
  deriveStatus,
  gradeFreeAnswer,
  finalizeSession,
  getReviewData,
  endSession,
} from "./rooms.js";
import { createAccount, topupTest, getAccountById } from "./accounts.js";
import { listExamRecords, getExamRecord } from "./history.js";
import { createClass, addStudent } from "./classrooms.js";

const sampleQuiz = {
  title: "Capitales",
  totalDurationSec: 60,
  questions: [
    {
      text: "Capitale de la France ?",
      type: "single",
      basePoints: 1000,
      answers: [
        { text: "Paris", color: "#fff", correct: true },
        { text: "Lyon", color: "#fff", correct: false },
      ],
    },
    {
      text: "Lesquelles sont des îles ?",
      type: "multiple",
      basePoints: 1000,
      answers: [
        { text: "Madagascar", color: "#fff", correct: true },
        { text: "Maurice", color: "#fff", correct: true },
        { text: "Mali", color: "#fff", correct: false },
      ],
    },
  ],
};

test("flux complet : création → jeu → classement", async () => {
  setRedisClient(createFakeRedis());

  // 1) Création de la salle
  const meta = await createRoom("Prof");
  const code = meta.code;
  assert.ok(code, "un code est généré");
  assert.equal(deriveStatus(meta), "lobby");

  // 2) Configuration du quiz
  const quizRes = await setQuiz(code, sampleQuiz);
  assert.equal(quizRes.ok, true);

  // 3) Inscription de deux joueurs en lobby
  assert.equal((await joinRoom(code)).ok, true);
  const alice = await registerPlayer(code, "Alice");
  const bob = await registerPlayer(code, "Bob");
  assert.ok(alice.playerId && bob.playerId);

  // 4) Lancement → inscriptions closes
  const start = await startGame(code);
  assert.equal(start.ok, true);
  const refused = await joinRoom(code);
  assert.equal(refused.ok, false);
  assert.equal(refused.status, 409);

  // Récupère les ids de questions tels que stockés
  const board0 = await getLeaderboard(code);
  assert.equal(board0.status, "running");

  // On relit la meta via getMe plus tard ; ici on rejoue les ids depuis le quiz
  // sanitizé en passant par une réponse.
  const { getMeta } = await import("./rooms.js");
  const full = await getMeta(code);
  const [q1, q2] = full.quiz.questions;

  // 5) Alice répond juste aux deux questions
  await revealQuestion(code, alice.playerId, q1.id);
  const a1 = await submitAnswer(code, alice.playerId, q1.id, [
    q1.answers.find((a) => a.correct).id,
  ]);
  assert.equal(a1.correct, true);
  assert.ok(a1.points > 0, "bonne réponse rapide = points positifs");

  await revealQuestion(code, alice.playerId, q2.id);
  const correctMulti = q2.answers.filter((a) => a.correct).map((a) => a.id);
  const a2 = await submitAnswer(code, alice.playerId, q2.id, correctMulti);
  assert.equal(a2.correct, true);

  // Double réponse à la même question → refusée
  const dup = await submitAnswer(code, alice.playerId, q1.id, []);
  assert.equal(dup.ok, false);
  assert.equal(dup.status, 409);

  // 6) Bob répond faux à la Q1, partiel à la Q2 (donc faux)
  await revealQuestion(code, bob.playerId, q1.id);
  const b1 = await submitAnswer(code, bob.playerId, q1.id, [
    q1.answers.find((a) => !a.correct).id,
  ]);
  assert.equal(b1.correct, false);
  assert.equal(b1.points, 0);

  await revealQuestion(code, bob.playerId, q2.id);
  const b2 = await submitAnswer(code, bob.playerId, q2.id, [correctMulti[0]]);
  assert.equal(b2.correct, false, "sous-ensemble = faux (pas de crédit partiel)");

  // 7) Classement : Alice 1re, Bob 2e
  const board = await getLeaderboard(code);
  assert.equal(board.leaderboard[0].pseudo, "Alice");
  assert.equal(board.leaderboard[0].rank, 1);
  assert.equal(board.leaderboard[1].pseudo, "Bob");
  assert.equal(board.leaderboard[1].rank, 2);
  assert.equal(board.podium.length, 2);

  // 8) Résultat personnel d'Alice : 2/2 bonnes → note 20/20
  const meAlice = await getMe(code, alice.playerId);
  assert.equal(meAlice.rank, 1);
  assert.equal(meAlice.nbCorrect, 2);
  assert.equal(meAlice.note, 20);

  const meBob = await getMe(code, bob.playerId);
  assert.equal(meBob.score, 0);
  assert.equal(meBob.note, 0);
});

test("setQuiz refuse un quiz invalide (aucune bonne réponse)", async () => {
  setRedisClient(createFakeRedis());
  const meta = await createRoom("Prof");
  const res = await setQuiz(meta.code, {
    title: "X",
    totalDurationSec: 30,
    questions: [
      {
        text: "Q",
        type: "single",
        basePoints: 1000,
        answers: [
          { text: "a", color: "#fff", correct: false },
          { text: "b", color: "#fff", correct: false },
        ],
      },
    ],
  });
  assert.equal(res.ok, false);
  assert.match(res.error, /bonne réponse/i);
});

test("validateQuiz accepte une question à réponse libre (sans réponses prédéfinies)", async () => {
  setRedisClient(createFakeRedis());
  const meta = await createRoom("Prof");
  const res = await setQuiz(meta.code, {
    title: "Ouvert",
    mode: "examen",
    totalDurationSec: 30,
    questions: [{ text: "Expliquez X", type: "free", basePoints: 500 }],
  });
  assert.equal(res.ok, true);
});

test("réponses libres : soumission → review → validation → finalisation", async () => {
  setRedisClient(createFakeRedis());
  const meta = await createRoom("Prof");
  const code = meta.code;

  const quizRes = await setQuiz(code, {
    title: "Capitales (ouvert)",
    mode: "examen",
    totalDurationSec: 60,
    questions: [
      {
        text: "Capitale de Madagascar ?",
        type: "free",
        basePoints: 1000,
        reference: "Antananarivo",
      },
    ],
  });
  assert.equal(quizRes.ok, true);

  const alice = await registerPlayer(code, "Alice");
  const bob = await registerPlayer(code, "Bob");
  await startGame(code);

  const full = await getMeta(code);
  const [q] = full.quiz.questions;
  assert.equal(q.type, "free");
  assert.equal(q.reference, "Antananarivo");
  assert.deepEqual(q.answers, []);

  // Soumissions libres : pas de point immédiat, en attente de validation
  await revealQuestion(code, alice.playerId, q.id);
  const aSub = await submitAnswer(code, alice.playerId, q.id, null, "Antananarivo");
  assert.equal(aSub.ok, true);
  assert.equal(aSub.pending, true);
  await submitAnswer(code, bob.playerId, q.id, null, "Toamasina");

  // Tant que rien n'est validé, scores à 0
  let board = await getLeaderboard(code);
  assert.equal(board.leaderboard.every((p) => p.score === 0), true);

  // Chrono écoulé sans finalisation → statut "review"
  const m2 = await getMeta(code);
  assert.equal(deriveStatus(m2, m2.startedAt + m2.durationMs + 1), "review");

  // Vue correction : 2 soumissions en attente
  const review = await getReviewData(code);
  assert.equal(review.questions.length, 1);
  assert.equal(review.questions[0].submissions.length, 2);
  assert.equal(review.pending, 2);

  // Le formateur valide Alice, refuse Bob
  const g1 = await gradeFreeAnswer(code, alice.playerId, q.id, true);
  assert.equal(g1.ok, true);
  assert.ok(g1.points > 0, "réponse validée = points positifs");
  await gradeFreeAnswer(code, bob.playerId, q.id, false);
  assert.equal((await getReviewData(code)).pending, 0);

  // Finalisation → "ended" et notes débloquées
  assert.equal((await finalizeSession(code)).ok, true);
  assert.equal(deriveStatus(await getMeta(code)), "ended");

  board = await getLeaderboard(code);
  const aliceRow = board.leaderboard.find((p) => p.pseudo === "Alice");
  const bobRow = board.leaderboard.find((p) => p.pseudo === "Bob");
  assert.ok(aliceRow.score > 0);
  assert.equal(aliceRow.nbCorrect, 1);
  assert.equal(aliceRow.note, 20); // 1/1 bonne réponse
  assert.equal(bobRow.score, 0);
  assert.equal(bobRow.note, 0);
  assert.equal(aliceRow.rank, 1);
});

test("deriveStatus : sans réponse libre, le chrono écoulé clôt directement", async () => {
  setRedisClient(createFakeRedis());
  const meta = await createRoom("Prof");
  await setQuiz(meta.code, {
    title: "QCM",
    totalDurationSec: 30,
    questions: [
      {
        text: "2+2 ?",
        type: "single",
        basePoints: 1000,
        answers: [
          { text: "4", color: "#fff", correct: true },
          { text: "5", color: "#fff", correct: false },
        ],
      },
    ],
  });
  await startGame(meta.code);
  const m = await getMeta(meta.code);
  assert.equal(deriveStatus(m, m.startedAt + m.durationMs + 1), "ended");
});

test("setQuiz refuse une réponse libre en mode Libre", async () => {
  setRedisClient(createFakeRedis());
  const meta = await createRoom("Prof");
  const res = await setQuiz(meta.code, {
    title: "X",
    mode: "libre",
    totalDurationSec: 30,
    questions: [{ text: "Ouvrez", type: "free", basePoints: 500 }],
  });
  assert.equal(res.ok, false);
  assert.match(res.error, /mode Examen/i);
});

test("setQuiz : mode/capacity normalisés et persistés", async () => {
  setRedisClient(createFakeRedis());
  const meta = await createRoom("Prof");
  const res = await setQuiz(meta.code, {
    title: "Exam",
    mode: "examen",
    capacity: "unlimited",
    totalDurationSec: 60,
    questions: [{ text: "Ouvrez", type: "free", basePoints: 500 }],
  });
  assert.equal(res.ok, true);
  const full = await getMeta(meta.code);
  assert.equal(full.quiz.mode, "examen");
  assert.equal(full.quiz.capacity, "unlimited");
  assert.equal(full.endedAt, null);
  assert.equal(full.settled, null);
});

test("registerPlayer : mode Libre plafonné à 10", async () => {
  setRedisClient(createFakeRedis());
  const meta = await createRoom("Prof");
  await setQuiz(meta.code, {
    title: "Libre",
    mode: "libre",
    totalDurationSec: 60,
    questions: [
      {
        text: "2+2 ?",
        type: "single",
        basePoints: 1000,
        answers: [
          { text: "4", color: "#fff", correct: true },
          { text: "5", color: "#fff", correct: false },
        ],
      },
    ],
  });
  for (let i = 0; i < 10; i++) {
    const r = await registerPlayer(meta.code, `J${i}`);
    assert.equal(r.ok, true, `inscription ${i} acceptée`);
  }
  const over = await registerPlayer(meta.code, "Onzième");
  assert.equal(over.ok, false);
  assert.equal(over.status, 409);
  assert.match(over.error, /pleine/i);
});

test("registerPlayer : Examen illimité n'a pas de plafond", async () => {
  setRedisClient(createFakeRedis());
  const meta = await createRoom("Prof");
  await setQuiz(meta.code, {
    title: "Exam",
    mode: "examen",
    capacity: "unlimited",
    totalDurationSec: 60,
    questions: [{ text: "Ouvrez", type: "free", basePoints: 500 }],
  });
  for (let i = 0; i < 25; i++) {
    const r = await registerPlayer(meta.code, `J${i}`);
    assert.equal(r.ok, true);
  }
});

test("endSession : clôture immédiate avant la fin du chrono", async () => {
  setRedisClient(createFakeRedis());
  const meta = await createRoom("Prof");
  await setQuiz(meta.code, {
    title: "Exam",
    mode: "examen",
    capacity: "small",
    totalDurationSec: 600,
    questions: [
      {
        text: "2+2 ?",
        type: "single",
        basePoints: 1000,
        answers: [
          { text: "4", color: "#fff", correct: true },
          { text: "5", color: "#fff", correct: false },
        ],
      },
    ],
  });
  await registerPlayer(meta.code, "Alice");
  await startGame(meta.code);
  assert.equal(deriveStatus(await getMeta(meta.code)), "running");

  const end = await endSession(meta.code);
  assert.equal(end.ok, true);
  assert.ok(end.endedAt > 0);
  assert.equal(deriveStatus(await getMeta(meta.code)), "ended");
});

test("getLeaderboard : prix exposé + settlement à la clôture (Examen)", async () => {
  setRedisClient(createFakeRedis());
  const meta = await createRoom("Prof");
  await setQuiz(meta.code, {
    title: "Exam",
    mode: "examen",
    capacity: "small",
    totalDurationSec: 600,
    questions: [
      {
        text: "2+2 ?",
        type: "single",
        basePoints: 1000,
        answers: [
          { text: "4", color: "#fff", correct: true },
          { text: "5", color: "#fff", correct: false },
        ],
      },
    ],
  });
  await registerPlayer(meta.code, "Alice");
  await startGame(meta.code);

  let board = await getLeaderboard(meta.code);
  assert.equal(board.priceAr, 1000);
  assert.equal(board.settled, null);

  await endSession(meta.code);
  board = await getLeaderboard(meta.code);
  assert.equal(board.status, "ended");
  assert.ok(board.settled);
  assert.equal(board.settled.amountAr, 1000);
  assert.equal(board.settled.charged, false);

  const full = await getMeta(meta.code);
  assert.equal(full.settled.amountAr, 1000);
});

test("Examen + compte : lancement bloqué sans solde, ok après recharge, débit à la clôture", async () => {
  setRedisClient(createFakeRedis());
  const { account } = await createAccount({ email: "p@e.mg", password: "secret1" });
  const meta = await createRoom("Prof", account.id);
  await setQuiz(meta.code, {
    title: "Exam",
    mode: "examen",
    capacity: "small",
    totalDurationSec: 600,
    questions: [
      {
        text: "2+2 ?",
        type: "single",
        basePoints: 1000,
        answers: [
          { text: "4", color: "#fff", correct: true },
          { text: "5", color: "#fff", correct: false },
        ],
      },
    ],
  });
  await registerPlayer(meta.code, "Alice");

  // Solde 0 → lancement refusé (402)
  const blocked = await startGame(meta.code);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 402);
  assert.equal(blocked.priceAr, 1000);

  // Recharge → lancement OK
  await topupTest(account.id, 5000);
  assert.equal((await startGame(meta.code)).ok, true);

  // Clôture → débit réel de 1000 Ar
  await endSession(meta.code);
  const board = await getLeaderboard(meta.code);
  assert.equal(board.status, "ended");
  assert.equal(board.settled.charged, true);
  assert.equal((await getAccountById(account.id)).balanceAr, 4000);
});

test("Examen + compte : un enregistrement est ajouté à l'historique à la clôture", async () => {
  setRedisClient(createFakeRedis());
  const { account } = await createAccount({ email: "p@e.mg", password: "secret1" });
  const meta = await createRoom("Prof", account.id);
  await setQuiz(meta.code, {
    title: "Histoire test",
    mode: "examen",
    capacity: "small",
    totalDurationSec: 600,
    questions: [
      {
        text: "2+2 ?",
        type: "single",
        basePoints: 1000,
        answers: [
          { text: "4", color: "#fff", correct: true },
          { text: "5", color: "#fff", correct: false },
        ],
      },
    ],
  });
  await registerPlayer(meta.code, "Alice");
  await topupTest(account.id, 5000);
  await startGame(meta.code);
  await endSession(meta.code);
  await getLeaderboard(meta.code); // déclenche le settle + snapshot

  const list = await listExamRecords(account.id);
  assert.equal(list.length, 1);
  assert.equal(list[0].title, "Histoire test");
  assert.equal(list[0].priceAr, 1000);
  assert.equal(list[0].participantCount, 1);

  const detail = await getExamRecord(account.id, list[0].id);
  assert.equal(detail.leaderboard[0].pseudo, "Alice");
});

test("Examen + compte : clôture pollée simultanément par host+participants ne débite qu'une fois", async () => {
  setRedisClient(createFakeRedis());
  const { account } = await createAccount({ email: "concurrent@e.mg", password: "secret1" });
  const meta = await createRoom("Prof", account.id);
  await setQuiz(meta.code, {
    title: "Exam concurrent",
    mode: "examen",
    capacity: "small",
    totalDurationSec: 600,
    questions: [
      {
        text: "2+2 ?",
        type: "single",
        basePoints: 1000,
        answers: [
          { text: "4", color: "#fff", correct: true },
          { text: "5", color: "#fff", correct: false },
        ],
      },
    ],
  });
  await registerPlayer(meta.code, "Alice");
  await topupTest(account.id, 5000);
  await startGame(meta.code);
  await endSession(meta.code);

  // Thundering herd : host + plusieurs participants pollent
  // /api/room/[code]/results (→ getLeaderboard) en même temps dès la fin
  // de partie. Sans verrou, chacun lirait `settled === null` et
  // débiterait/enregistrerait l'examen en double.
  const boards = await Promise.all(
    Array.from({ length: 10 }, () => getLeaderboard(meta.code)),
  );
  assert.ok(boards.every((b) => b.settled?.charged === true));

  // Un seul débit de 1000 Ar (pas dix) : 5000 - 1000 = 4000.
  assert.equal((await getAccountById(account.id)).balanceAr, 4000);

  // Un seul enregistrement d'historique (pas dix doublons).
  const list = await listExamRecords(account.id);
  assert.equal(list.length, 1);
});

test("Examen nominatif : roster figé, inscription par élève, résultats nominatifs", async () => {
  setRedisClient(createFakeRedis());
  const { account } = await createAccount({ email: "p@e.mg", password: "secret1" });
  const cls = await createClass(account.id, "6ème A");
  const alice = await addStudent(account.id, cls.classroom.id, "Alice");
  const bob = await addStudent(account.id, cls.classroom.id, "Bob");

  const meta = await createRoom("Prof", account.id);
  await setQuiz(meta.code, {
    title: "Contrôle",
    mode: "examen",
    capacity: "small",
    classId: cls.classroom.id,
    totalDurationSec: 600,
    questions: [
      {
        text: "2+2 ?",
        type: "single",
        basePoints: 1000,
        answers: [
          { text: "4", color: "#fff", correct: true },
          { text: "5", color: "#fff", correct: false },
        ],
      },
    ],
  });

  const full = await getMeta(meta.code);
  assert.equal(full.quiz.className, "6ème A");
  assert.equal(full.quiz.roster.length, 2);

  // Inscription nominative
  const r = await registerPlayer(meta.code, null, alice.student.id);
  assert.equal(r.ok, true);
  assert.equal(r.pseudo, "Alice");

  // Même élève → refusé
  const dup = await registerPlayer(meta.code, null, alice.student.id);
  assert.equal(dup.ok, false);
  assert.equal(dup.status, 409);

  // studentId inconnu → refusé
  const bad = await registerPlayer(meta.code, "Pirate", "inconnu");
  assert.equal(bad.ok, false);
  assert.equal(bad.status, 400);

  await registerPlayer(meta.code, null, bob.student.id);
  await topupTest(account.id, 5000);
  await startGame(meta.code);
  await endSession(meta.code);

  const board = await getLeaderboard(meta.code);
  assert.equal(board.status, "ended");
  assert.ok(board.leaderboard.every((p) => p.studentId)); // nominatif

  const list = await listExamRecords(account.id);
  assert.equal(list[0].title, "Contrôle");
  assert.equal(list[0].className, "6ème A");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { setRedisClient, getRedis } from "./redis.js";
import { createFakeRedis } from "./testFakeRedis.js";
import {
  IDX_ACCOUNTS,
  IDX_EXAMS,
  IDX_LAST_SEEN,
  IDX_PLAYS,
  IDX_TXNS,
  countAll,
  idsBetween,
  playKey,
} from "./indexes.js";
import { createAccount, createSession, topupTest } from "./accounts.js";
import { saveExamRecord } from "./history.js";
import { initiateTopup } from "./payments.js";
import { createRoom, setQuiz, startGame } from "./rooms.js";

// Ces tests vérifient le BRANCHEMENT, pas le module d'index lui-même : un
// appel oublié dans accounts/history/payments/rooms afficherait un tableau
// de bord à zéro sans qu'aucun test unitaire ne bronche.

const quizLibre = {
  title: "Essai",
  totalDurationSec: 60,
  mode: "libre",
  questions: [
    {
      text: "Capitale de Madagascar ?",
      type: "single",
      basePoints: 1000,
      answers: [
        { text: "Antananarivo", color: "#fff", correct: true },
        { text: "Toamasina", color: "#fff", correct: false },
      ],
    },
  ],
};

test("créer un compte l'inscrit dans l'index global", async () => {
  setRedisClient(createFakeRedis());
  const res = await createAccount({
    email: "Prof@Exemple.com",
    password: "secret123",
    name: "Prof",
  });
  assert.equal(res.ok, true);

  assert.equal(await countAll(IDX_ACCOUNTS), 1);
  assert.deepEqual(await idsBetween(IDX_ACCOUNTS, 0, Date.now() + 1000), [
    res.account.id,
  ]);
});

test("se connecter met à jour la dernière activité", async () => {
  setRedisClient(createFakeRedis());
  const { account } = await createAccount({
    email: "prof@exemple.com",
    password: "secret123",
  });
  assert.equal(await countAll(IDX_LAST_SEEN), 0, "rien avant connexion");

  await createSession(account.id);
  assert.equal(await countAll(IDX_LAST_SEEN), 1);
  assert.ok(await getRedis().zscore(IDX_LAST_SEEN, account.id));
});

test("archiver un examen l'inscrit dans l'index global", async () => {
  setRedisClient(createFakeRedis());
  await saveExamRecord({
    id: "ex_1",
    accountId: "acc_1",
    endedAt: 1700000000000,
    priceAr: 1000,
    charged: true,
    participantCount: 12,
  });

  assert.equal(await countAll(IDX_EXAMS), 1);
  assert.deepEqual(await idsBetween(IDX_EXAMS, 0, Date.now()), ["ex_1"]);
});

test("une recharge est indexée dès sa création, avant même sa complétion", async () => {
  setRedisClient(createFakeRedis());
  const { account } = await createAccount({
    email: "prof@exemple.com",
    password: "secret123",
  });

  const res = await initiateTopup(account.id, 5000, "stub");
  assert.equal(res.ok, true);
  assert.equal(await countAll(IDX_TXNS), 1, "indexée une seule fois");
});

test("lancer une partie LIBRE laisse une trace durable — le mode gratuit devient visible", async () => {
  setRedisClient(createFakeRedis());
  const meta = await createRoom("Prof invité"); // hôte non connecté
  await setQuiz(meta.code, quizLibre);
  const start = await startGame(meta.code);
  assert.equal(start.ok, true);

  assert.equal(await countAll(IDX_PLAYS), 1);
  const [playId] = await idsBetween(IDX_PLAYS, 0, Date.now() + 1000);
  const play = await getRedis().get(playKey(playId));
  assert.equal(play.mode, "libre");
  assert.equal(play.code, meta.code);
  assert.equal(play.hostAccountId, null, "hôte invité : aucun compte");
  assert.equal(play.startedAt, start.startedAt);
});

test("lancer un EXAMEN trace la partie et l'activité du formateur", async () => {
  setRedisClient(createFakeRedis());
  const { account } = await createAccount({
    email: "prof@exemple.com",
    password: "secret123",
  });
  await topupTest(account.id, 5000);

  const meta = await createRoom("Prof", account.id);
  await setQuiz(meta.code, {
    ...quizLibre,
    mode: "examen",
    capacity: "small",
  });
  const start = await startGame(meta.code);
  assert.equal(start.ok, true);

  const [playId] = await idsBetween(IDX_PLAYS, 0, Date.now() + 1000);
  const play = await getRedis().get(playKey(playId));
  assert.equal(play.mode, "examen");
  assert.equal(play.capacity, "small");
  assert.equal(play.hostAccountId, account.id);
  assert.equal(
    await getRedis().zscore(IDX_LAST_SEEN, account.id),
    start.startedAt,
    "le lancement compte comme activité",
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { setRedisClient, getRedis } from "./redis.js";
import { createFakeRedis } from "./testFakeRedis.js";
import { createAccount, debit, credit } from "./accounts.js";
import { createClass, addStudent, deleteClass } from "./classrooms.js";
import { createQuiz, updateQuiz } from "./quizzes.js";
import { createRoom, registerPlayer, getMeta, deriveStatus } from "./rooms.js";
import { isCodeReserved } from "./codeReservation.js";
import { WELCOME_CREDIT_AR, PRICE_SMALL_AR } from "./exam.js";
import {
  scheduleExam,
  getScheduledExam,
  cancelScheduledExam,
  openScheduledIfDue,
  listUpcoming,
  listPast,
  countScheduled,
  scheduledAffordability,
  MAX_SCHEDULED_PER_ACCOUNT,
  MAX_AHEAD_MS,
  schedAcctKey,
  SCHED_OUVERT,
  SCHED_ANNULE,
} from "./scheduled.js";

const T0 = 1_800_000_000_000; // base de temps fixe, lisible dans les erreurs
const MIN = 60 * 1000;

/** Fige l'horloge ; `horloge.set(t)` déplace le temps du serveur. */
function figerHorloge(t = T0) {
  const vrai = Date.now;
  let courant = t;
  Date.now = () => courant;
  return {
    set: (v) => {
      courant = v;
    },
    avance: (ms) => {
      courant += ms;
    },
    restore: () => {
      Date.now = vrai;
    },
  };
}

const quizQcm = (extra = {}) => ({
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

/** Compte + quiz enregistré, socle de presque tous les tests. */
async function socle({ solde = WELCOME_CREDIT_AR } = {}) {
  const { account } = await createAccount({ email: "f@e.mg", password: "secret1" });
  if (solde > WELCOME_CREDIT_AR) await credit(account.id, solde - WELCOME_CREDIT_AR);
  if (solde < WELCOME_CREDIT_AR) await debit(account.id, WELCOME_CREDIT_AR - solde);
  const { quiz } = await createQuiz(account.id, quizQcm());
  return { account, quiz };
}

test("scheduleExam réserve le code tout de suite", async () => {
  setRedisClient(createFakeRedis());
  const h = figerHorloge();
  try {
    const { account, quiz } = await socle();
    const { ok, scheduled } = await scheduleExam(account.id, {
      quizId: quiz.id,
      startsAt: T0 + 60 * MIN,
    });

    assert.equal(ok, true);
    assert.match(scheduled.code, /^[A-Z0-9]{6}$/);
    assert.equal(scheduled.status, "planifie");
    assert.equal(
      await isCodeReserved(scheduled.code),
      true,
      "le code doit être retenu dès la programmation — il sera distribué avant",
    );
    // La salle n'existe pas encore.
    assert.equal(await getMeta(scheduled.code), null);
    // Fenêtre d'inscription par défaut : 5 min après l'ouverture.
    assert.equal(scheduled.autoStartAt, scheduled.startsAt + 5 * MIN);
  } finally {
    h.restore();
  }
});

test("createRoom consulte bien les codes réservés avant d'attribuer", async () => {
  const fake = createFakeRedis();
  setRedisClient(fake);
  const h = figerHorloge();
  try {
    const { account, quiz } = await socle();
    const { scheduled } = await scheduleExam(account.id, {
      quizId: quiz.id,
      startsAt: T0 + 60 * MIN,
    });

    // Test d'interaction, et non de résultat : la collision est trop
    // improbable pour être observée par tirage, mais la garde, elle, peut
    // très bien disparaître d'un refactor. C'est donc son appel qu'on
    // verrouille.
    const consultees = [];
    const vraiExists = fake.exists.bind(fake);
    fake.exists = async (k) => {
      consultees.push(k);
      return vraiExists(k);
    };

    const salle = await createRoom("Formateur", account.id);

    assert.ok(
      consultees.some((k) => k.startsWith("reservedCode:")),
      "createRoom doit vérifier qu'un code n'est pas déjà réservé",
    );
    assert.notEqual(salle.code, scheduled.code);
  } finally {
    h.restore();
  }
});

test("avant l'heure : phase attente, aucune salle créée", async () => {
  setRedisClient(createFakeRedis());
  const h = figerHorloge();
  try {
    const { account, quiz } = await socle();
    const { scheduled } = await scheduleExam(account.id, {
      quizId: quiz.id,
      startsAt: T0 + 30 * MIN,
    });

    h.avance(22 * MIN); // 8 min avant
    const vue = await openScheduledIfDue(scheduled.code);

    assert.equal(vue.phase, "attente");
    assert.equal(vue.startsAt, T0 + 30 * MIN);
    assert.equal(vue.title, "Contrôle de géométrie");
    assert.equal(await getMeta(scheduled.code), null, "rien n'est créé en avance");
  } finally {
    h.restore();
  }
});

test("à l'heure : la salle s'ouvre en LOBBY, les inscriptions sont possibles", async () => {
  setRedisClient(createFakeRedis());
  const h = figerHorloge();
  try {
    const { account, quiz } = await socle();
    const { scheduled } = await scheduleExam(account.id, {
      quizId: quiz.id,
      startsAt: T0 + 10 * MIN,
    });

    h.set(T0 + 10 * MIN); // pile à l'heure
    const vue = await openScheduledIfDue(scheduled.code);

    assert.equal(vue.phase, "ouvert");
    assert.equal(
      vue.status,
      "lobby",
      "le chrono ne part pas tout de suite, sinon personne ne peut s'inscrire",
    );

    const meta = await getMeta(scheduled.code);
    assert.ok(meta, "la salle existe");
    assert.equal(meta.hostAccountId, account.id);
    assert.equal(meta.quiz.title, "Contrôle de géométrie");

    // C'est le point qui justifie les deux heures distinctes.
    const r1 = await registerPlayer(scheduled.code, "Alice");
    const r2 = await registerPlayer(scheduled.code, "Bob");
    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);

    const maj = await getScheduledExam(account.id, scheduled.id);
    assert.equal(maj.status, SCHED_OUVERT);
    assert.equal(maj.openedAt, T0 + 10 * MIN);
  } finally {
    h.restore();
  }
});

test("trente accès simultanés ne créent qu'une seule salle", async () => {
  setRedisClient(createFakeRedis());
  const h = figerHorloge();
  try {
    const { account, quiz } = await socle();
    const { scheduled } = await scheduleExam(account.id, {
      quizId: quiz.id,
      startsAt: T0 + 5 * MIN,
    });

    h.set(T0 + 5 * MIN);
    const vues = await Promise.all(
      Array.from({ length: 30 }, () => openScheduledIfDue(scheduled.code)),
    );

    // Tous obtiennent une réponse exploitable…
    assert.ok(
      vues.every((v) => v.ok && (v.phase === "ouvert" || v.phase === "attente")),
      "aucun accès ne doit échouer",
    );
    // …et il n'y a qu'une salle, avec un seul quiz posé.
    const meta = await getMeta(scheduled.code);
    assert.ok(meta);
    assert.equal(meta.quiz.questions.length, 1);
    const ouverts = await getScheduledExam(account.id, scheduled.id);
    assert.equal(ouverts.status, SCHED_OUVERT);
  } finally {
    h.restore();
  }
});

test("à la fin de la fenêtre d'inscription, le chrono part tout seul", async () => {
  setRedisClient(createFakeRedis());
  const h = figerHorloge();
  try {
    const { account, quiz } = await socle();
    const { scheduled } = await scheduleExam(account.id, {
      quizId: quiz.id,
      startsAt: T0 + 5 * MIN,
      registrationWindowMin: 3,
    });

    h.set(T0 + 5 * MIN);
    await openScheduledIfDue(scheduled.code);
    await registerPlayer(scheduled.code, "Alice");
    assert.equal(deriveStatus(await getMeta(scheduled.code)), "lobby");

    // Fenêtre écoulée : le premier accès suivant lance la partie.
    h.set(T0 + 8 * MIN);
    const vue = await openScheduledIfDue(scheduled.code);

    assert.equal(vue.phase, "ouvert");
    assert.equal(vue.status, "running");
    const meta = await getMeta(scheduled.code);
    assert.equal(meta.startedAt, T0 + 8 * MIN);
    assert.equal(meta.durationMs, 600 * 1000);
    // Et les inscriptions sont désormais closes, comme pour tout examen lancé.
    assert.equal((await registerPlayer(scheduled.code, "Tardif")).status, 409);
  } finally {
    h.restore();
  }
});

test("solde insuffisant : phase bloquée, réversible après recharge", async () => {
  setRedisClient(createFakeRedis());
  const h = figerHorloge();
  try {
    const { account, quiz } = await socle({ solde: 0 });
    const { scheduled } = await scheduleExam(account.id, {
      quizId: quiz.id,
      startsAt: T0 + 5 * MIN,
      registrationWindowMin: 3,
    });

    // La salle s'ouvre : l'ouverture ne coûte rien.
    h.set(T0 + 5 * MIN);
    assert.equal((await openScheduledIfDue(scheduled.code)).phase, "ouvert");
    await registerPlayer(scheduled.code, "Alice");

    // Le départ du chrono, lui, exige un solde.
    h.set(T0 + 8 * MIN);
    const bloque = await openScheduledIfDue(scheduled.code);
    assert.equal(bloque.phase, "bloque");
    assert.equal(bloque.reason, "solde");
    assert.equal(bloque.priceAr, PRICE_SMALL_AR);
    assert.equal(
      deriveStatus(await getMeta(scheduled.code)),
      "lobby",
      "la salle reste intacte, les inscrits ne sont pas perdus",
    );

    // Le formateur recharge : l'accès suivant débloque, rien à recréer.
    await credit(account.id, PRICE_SMALL_AR);
    const reparti = await openScheduledIfDue(scheduled.code);
    assert.equal(reparti.phase, "ouvert");
    assert.equal(reparti.status, "running");
  } finally {
    h.restore();
  }
});

test("les questions sont figées : modifier le quiz ne change pas l'examen programmé", async () => {
  setRedisClient(createFakeRedis());
  const h = figerHorloge();
  try {
    const { account, quiz } = await socle();
    const { scheduled } = await scheduleExam(account.id, {
      quizId: quiz.id,
      startsAt: T0 + 10 * MIN,
    });

    // Le formateur remanie son quiz dans la bibliothèque, après coup.
    await updateQuiz(
      account.id,
      quiz.id,
      quizQcm({
        title: "Tout autre chose",
        questions: [
          {
            text: "Question substituée ?",
            type: "single",
            answers: [
              { text: "Oui", correct: true },
              { text: "Non", correct: false },
            ],
          },
        ],
      }),
    );

    h.set(T0 + 10 * MIN);
    await openScheduledIfDue(scheduled.code);
    const meta = await getMeta(scheduled.code);

    assert.equal(meta.quiz.title, "Contrôle de géométrie");
    assert.equal(meta.quiz.questions[0].text, "Combien de côtés a un hexagone ?");
  } finally {
    h.restore();
  }
});

test("le roster est relu à chaud : un élève inscrit entre-temps peut passer", async () => {
  setRedisClient(createFakeRedis());
  const h = figerHorloge();
  try {
    const { account, quiz } = await socle();
    const { classroom } = await createClass(account.id, "3e B");
    await addStudent(account.id, classroom.id, "Alice");

    const { scheduled } = await scheduleExam(account.id, {
      quizId: quiz.id,
      classId: classroom.id,
      startsAt: T0 + 10 * MIN,
    });

    // Nouvel élève APRÈS la programmation.
    await addStudent(account.id, classroom.id, "Bob");

    h.set(T0 + 10 * MIN);
    await openScheduledIfDue(scheduled.code);
    const meta = await getMeta(scheduled.code);

    assert.deepEqual(
      meta.quiz.roster.map((s) => s.name),
      ["Alice", "Bob"],
      "la composition de la classe n'est pas figée, les questions le sont",
    );
    assert.equal(meta.quiz.className, "3e B");
  } finally {
    h.restore();
  }
});

test("classe supprimée : on retombe sur le roster figé, pas sur des pseudos libres", async () => {
  setRedisClient(createFakeRedis());
  const h = figerHorloge();
  try {
    const { account, quiz } = await socle();
    const { classroom } = await createClass(account.id, "3e B");
    await addStudent(account.id, classroom.id, "Alice");

    const { scheduled } = await scheduleExam(account.id, {
      quizId: quiz.id,
      classId: classroom.id,
      startsAt: T0 + 10 * MIN,
    });
    await deleteClass(account.id, classroom.id);

    h.set(T0 + 10 * MIN);
    await openScheduledIfDue(scheduled.code);
    const meta = await getMeta(scheduled.code);

    assert.equal(meta.quiz.roster.length, 1);
    assert.equal(meta.quiz.roster[0].name, "Alice");
    // Sans ce repli, n'importe qui entrerait sous n'importe quel nom.
    assert.equal((await registerPlayer(scheduled.code, "Intrus")).status, 400);
  } finally {
    h.restore();
  }
});

test("validations de date et de contenu", async () => {
  setRedisClient(createFakeRedis());
  const h = figerHorloge();
  try {
    const { account, quiz } = await socle();

    const passe = await scheduleExam(account.id, {
      quizId: quiz.id,
      startsAt: T0 - 10 * MIN,
    });
    assert.equal(passe.status, 400);
    assert.match(passe.error, /déjà passée/);

    const loin = await scheduleExam(account.id, {
      quizId: quiz.id,
      startsAt: T0 + MAX_AHEAD_MS + MIN,
    });
    assert.equal(loin.status, 400);
    assert.match(loin.error, /an à l'avance/);

    assert.equal(
      (await scheduleExam(account.id, { quizId: quiz.id, startsAt: "bientôt" })).status,
      400,
    );
    assert.equal(
      (await scheduleExam(account.id, { quizId: "qz_inconnu", startsAt: T0 + MIN }))
        .status,
      404,
    );
    assert.equal(
      (
        await scheduleExam(account.id, {
          quizId: quiz.id,
          classId: "cls_inconnue",
          startsAt: T0 + MIN,
        })
      ).status,
      404,
      "mieux vaut refuser maintenant que découvrir la classe absente à l'ouverture",
    );

    // Une minute de tolérance pour l'horloge du client.
    assert.equal(
      (await scheduleExam(account.id, { quizId: quiz.id, startsAt: T0 - 30 * 1000 })).ok,
      true,
    );
  } finally {
    h.restore();
  }
});

test("annulation : libère le code, et devient impossible après ouverture", async () => {
  setRedisClient(createFakeRedis());
  const h = figerHorloge();
  try {
    const { account, quiz } = await socle();
    const a = await scheduleExam(account.id, {
      quizId: quiz.id,
      startsAt: T0 + 10 * MIN,
    });

    assert.equal((await cancelScheduledExam("acc_autre", a.scheduled.id)).status, 404);

    assert.equal((await cancelScheduledExam(account.id, a.scheduled.id)).ok, true);
    assert.equal(await isCodeReserved(a.scheduled.code), false, "code rendu");
    assert.equal(await countScheduled(account.id), 0, "retiré du planning");
    assert.equal(
      (await getScheduledExam(account.id, a.scheduled.id)).status,
      SCHED_ANNULE,
      "la trace subsiste, pour qu'un élève sache que c'est annulé",
    );
    assert.equal((await openScheduledIfDue(a.scheduled.code)).status, 404);

    // Un examen déjà ouvert ne s'annule plus : des élèves sont inscrits.
    const b = await scheduleExam(account.id, {
      quizId: quiz.id,
      startsAt: T0 + 20 * MIN,
    });
    h.set(T0 + 20 * MIN);
    await openScheduledIfDue(b.scheduled.code);
    const refus = await cancelScheduledExam(account.id, b.scheduled.id);
    assert.equal(refus.status, 409);
    assert.equal(await isCodeReserved(b.scheduled.code), true, "code toujours tenu");
  } finally {
    h.restore();
  }
});

test("un examen annulé l'annonce au participant", async () => {
  setRedisClient(createFakeRedis());
  const h = figerHorloge();
  try {
    const { account, quiz } = await socle();
    const { scheduled } = await scheduleExam(account.id, {
      quizId: quiz.id,
      startsAt: T0 + 10 * MIN,
    });
    // On annule sans libérer le code, pour éprouver la branche « annule ».
    const doc = await getScheduledExam(account.id, scheduled.id);
    doc.status = SCHED_ANNULE;
    await getRedis().set(`scheduledExam:${doc.id}`, doc);

    const vue = await openScheduledIfDue(scheduled.code);
    assert.equal(vue.phase, "annule");
    assert.equal(vue.title, "Contrôle de géométrie");
  } finally {
    h.restore();
  }
});

test("planning : à venir du plus proche, passés du plus récent", async () => {
  setRedisClient(createFakeRedis());
  const h = figerHorloge();
  try {
    const { account, quiz } = await socle();
    for (const [titre, delta] of [
      ["Dans 3 jours", 3 * 24 * 60 * MIN],
      ["Dans 1 heure", 60 * MIN],
      ["Dans 2 jours", 2 * 24 * 60 * MIN],
    ]) {
      const { quiz: q } = await createQuiz(account.id, quizQcm({ title: titre }));
      await scheduleExam(account.id, { quizId: q.id, startsAt: T0 + delta });
    }
    // Un examen passé.
    const { quiz: ancien } = await createQuiz(account.id, quizQcm({ title: "Hier" }));
    const passe = await scheduleExam(account.id, {
      quizId: ancien.id,
      startsAt: T0 + MIN,
    });

    h.set(T0 + 2 * MIN); // l'examen « Hier » est maintenant derrière nous

    assert.deepEqual(
      (await listUpcoming(account.id)).map((s) => s.title),
      ["Dans 1 heure", "Dans 2 jours", "Dans 3 jours"],
      "le planning se lit du plus proche au plus lointain",
    );
    assert.deepEqual(
      (await listPast(account.id)).map((s) => s.title),
      ["Hier"],
    );
    assert.equal((await listPast(account.id))[0].code, passe.scheduled.code);
    assert.equal(await countScheduled(account.id), 4);
    // Le quiz n'est pas transporté dans les résumés.
    assert.equal((await listUpcoming(account.id))[0].questions, undefined);
    assert.equal((await listUpcoming(account.id))[0].questionCount, 1);
  } finally {
    h.restore();
  }
});

test("scheduledAffordability prévient avant l'échéance", async () => {
  setRedisClient(createFakeRedis());
  const h = figerHorloge();
  try {
    const { account, quiz } = await socle({ solde: 0 });
    const { scheduled } = await scheduleExam(account.id, {
      quizId: quiz.id,
      startsAt: T0 + 60 * MIN,
    });

    const avant = await scheduledAffordability(account.id, scheduled);
    assert.equal(avant.required, true);
    assert.equal(avant.affordable, false, "c'est CE signal qui évite le blocage");
    assert.equal(avant.priceAr, PRICE_SMALL_AR);

    await credit(account.id, PRICE_SMALL_AR);
    assert.equal((await scheduledAffordability(account.id, scheduled)).affordable, true);
  } finally {
    h.restore();
  }
});

test("un quiz en mode Libre ne réclame aucun solde", async () => {
  setRedisClient(createFakeRedis());
  const h = figerHorloge();
  try {
    const { account } = await createAccount({ email: "l@e.mg", password: "secret1" });
    await debit(account.id, WELCOME_CREDIT_AR);
    const { quiz } = await createQuiz(
      account.id,
      quizQcm({ mode: "libre", capacity: "small" }),
    );
    const { scheduled } = await scheduleExam(account.id, {
      quizId: quiz.id,
      startsAt: T0 + 5 * MIN,
      registrationWindowMin: 3,
    });

    assert.equal((await scheduledAffordability(account.id, scheduled)).required, false);

    h.set(T0 + 8 * MIN);
    const vue = await openScheduledIfDue(scheduled.code);
    assert.equal(vue.phase, "ouvert");
    assert.equal(vue.status, "running", "aucun solde requis en mode Libre");
  } finally {
    h.restore();
  }
});

test("plafond : refus explicite, aucune programmation évincée", async () => {
  const redis = createFakeRedis();
  setRedisClient(redis);
  const h = figerHorloge();
  try {
    const { account, quiz } = await socle();
    for (let i = 0; i < MAX_SCHEDULED_PER_ACCOUNT; i++) {
      await redis.zadd(schedAcctKey(account.id), { score: T0 + i, member: `sch_${i}` });
    }
    const r = await scheduleExam(account.id, {
      quizId: quiz.id,
      startsAt: T0 + 10 * MIN,
    });
    assert.equal(r.status, 409);
    assert.match(r.error, /Limite de 200/);
    assert.equal(await countScheduled(account.id), MAX_SCHEDULED_PER_ACCOUNT);
  } finally {
    h.restore();
  }
});

test("code inconnu : 404, sans rien créer", async () => {
  setRedisClient(createFakeRedis());
  const r = await openScheduledIfDue("ZZZZZZ");
  assert.equal(r.ok, false);
  assert.equal(r.status, 404);
});

test("planning isolé par compte", async () => {
  setRedisClient(createFakeRedis());
  const h = figerHorloge();
  try {
    const { account, quiz } = await socle();
    await scheduleExam(account.id, { quizId: quiz.id, startsAt: T0 + 10 * MIN });

    const { account: autre } = await createAccount({
      email: "g@e.mg",
      password: "secret1",
    });
    assert.deepEqual(await listUpcoming(autre.id), []);
    assert.equal(await countScheduled(autre.id), 0);
  } finally {
    h.restore();
  }
});

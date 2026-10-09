import { getRedis } from "./redis.js";
import { generateId, generateCode } from "./code.js";
import { createRoom, setQuiz, startGame, getMeta, deriveStatus } from "./rooms.js";
import { getQuiz, markQuizUsed } from "./quizzes.js";
import { getClass } from "./classrooms.js";
import { getAccountById } from "./accounts.js";
import { canAfford } from "./wallet.js";
import { examPriceAr } from "./exam.js";
import { withLock } from "./lock.js";
import {
  reserveCode,
  releaseCode,
  resolveReservedCode,
  isCodeReserved,
} from "./codeReservation.js";

// Examens programmés : un quiz, une classe, une date — et une salle qui
// s'ouvre d'elle-même.
//
// ARCHITECTURE : aucun cron, aucune tâche de fond. Les deux transitions
// (ouverture du lobby, puis départ du chrono) sont déclenchées par le premier
// accès survenant après l'heure, sous verrou Redis pour qu'un lobby pollé par
// trente téléphones ne crée pas trente salles. C'est le modèle qui colle au
// serverless : rien à provisionner, rien à surveiller.
//
// POURQUOI DEUX HEURES ET NON UNE. `registerPlayer` refuse les inscriptions
// dès que la partie est lancée. Ouvrir la salle ET lancer le chrono au même
// instant exclurait donc tout le monde sauf le premier arrivé. La salle ouvre
// donc en lobby à `startsAt`, et le chrono part à `autoStartAt` — la fin d'une
// fenêtre d'inscription. Un retardataire de trente secondes n'est pas recalé.
//
// CE QUI EST FIGÉ, CE QUI NE L'EST PAS. Les questions sont recopiées à la
// programmation : modifier le quiz dans la bibliothèque ne change pas un
// examen déjà programmé. Le roster de la classe, lui, est relu à l'ouverture
// (cf. `setQuiz`) — un élève arrivé entre-temps doit pouvoir passer l'épreuve.

const schedKey = (id) => `scheduledExam:${id}`;
export const schedAcctKey = (accountId) => `scheduled:acct:${accountId}`;

/** Fenêtres d'inscription proposées, en minutes. */
export const REGISTRATION_WINDOWS_MIN = [3, 5, 10, 15, 30];
export const DEFAULT_REGISTRATION_WINDOW_MIN = 5;

/** Même raisonnement de plafond que les classes et la bibliothèque. */
export const MAX_SCHEDULED_PER_ACCOUNT = 200;

/** On ne programme pas à plus d'un an : au-delà, c'est une faute de saisie. */
export const MAX_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;

/** Ni dans le passé. Une minute de tolérance pour l'horloge du client. */
export const PAST_TOLERANCE_MS = 60 * 1000;

export const SCHED_PLANIFIE = "planifie";
export const SCHED_OUVERT = "ouvert";
export const SCHED_ANNULE = "annule";

const now = () => Date.now();

function normalizeWindow(min) {
  const n = Math.round(Number(min));
  return REGISTRATION_WINDOWS_MIN.includes(n)
    ? n
    : DEFAULT_REGISTRATION_WINDOW_MIN;
}

/** Résumé pour les listes : sans les questions, comme la bibliothèque. */
export function summarizeScheduled(s) {
  return {
    id: s.id,
    code: s.code,
    title: s.quiz?.title || "Examen",
    mode: s.quiz?.mode,
    capacity: s.quiz?.capacity,
    questionCount: (s.quiz?.questions || []).length,
    totalDurationSec: s.quiz?.totalDurationSec,
    quizId: s.quizId,
    classId: s.classId,
    className: s.className,
    startsAt: s.startsAt,
    autoStartAt: s.autoStartAt,
    registrationWindowMin: s.registrationWindowMin,
    status: s.status,
    openedAt: s.openedAt || null,
    createdAt: s.createdAt,
  };
}

/**
 * Programme un examen à partir d'un quiz de la bibliothèque.
 *
 * Le code est réservé immédiatement : c'est tout l'intérêt, le formateur peut
 * l'écrire au tableau une semaine à l'avance.
 */
export async function scheduleExam(
  accountId,
  { quizId, classId = null, startsAt, registrationWindowMin } = {},
) {
  if (!accountId) return { ok: false, status: 401, error: "Connexion requise." };

  const quiz = await getQuiz(accountId, quizId);
  if (!quiz) return { ok: false, status: 404, error: "Quiz introuvable." };

  const at = Number(startsAt);
  if (!Number.isFinite(at)) {
    return { ok: false, status: 400, error: "Date et heure requises." };
  }
  const t = now();
  if (at < t - PAST_TOLERANCE_MS) {
    return { ok: false, status: 400, error: "Cette date est déjà passée." };
  }
  if (at > t + MAX_AHEAD_MS) {
    return { ok: false, status: 400, error: "Un an à l'avance au maximum." };
  }

  // Classe : facultative, mais si elle est fournie elle doit exister et
  // appartenir au compte — sinon on programmerait un examen nominatif sur une
  // classe fantôme, et l'erreur n'apparaîtrait qu'à l'ouverture.
  let cls = null;
  if (classId) {
    cls = await getClass(accountId, classId);
    if (!cls) return { ok: false, status: 404, error: "Classe introuvable." };
  }

  const redis = getRedis();
  const existing = await redis.zcard(schedAcctKey(accountId));
  if (Number(existing) >= MAX_SCHEDULED_PER_ACCOUNT) {
    return {
      ok: false,
      status: 409,
      error: `Limite de ${MAX_SCHEDULED_PER_ACCOUNT} examens programmés atteinte. Annulez-en un pour en programmer un nouveau.`,
    };
  }

  const id = generateId("sch");
  // Réservation du code : `NX` côté Redis, donc deux programmations
  // simultanées ne peuvent pas se voir attribuer le même code.
  let code = null;
  for (let tentative = 0; tentative < 8; tentative += 1) {
    const candidat = generateCode();
    if (await isCodeReserved(candidat)) continue;
    if (await getMeta(candidat)) continue; // une salle vit déjà sous ce code
    if (await reserveCode(candidat, id)) {
      code = candidat;
      break;
    }
  }
  if (!code) {
    return {
      ok: false,
      status: 503,
      error: "Impossible d'attribuer un code pour l'instant. Réessayez.",
    };
  }

  const windowMin = normalizeWindow(registrationWindowMin);
  const doc = {
    id,
    accountId,
    code,
    quizId: quiz.id,
    // Copie des questions : la bibliothèque peut évoluer, cet examen non.
    quiz: {
      title: quiz.title,
      mode: quiz.mode,
      capacity: quiz.capacity,
      totalDurationSec: quiz.totalDurationSec,
      questions: quiz.questions,
    },
    classId: cls?.id || null,
    className: cls?.name || null,
    // Roster de secours, utilisé seulement si la classe a disparu d'ici là.
    rosterSnapshot: cls?.students || null,
    startsAt: at,
    registrationWindowMin: windowMin,
    autoStartAt: at + windowMin * 60 * 1000,
    status: SCHED_PLANIFIE,
    openedAt: null,
    createdAt: t,
  };

  await redis.set(schedKey(id), doc);
  await redis.zadd(schedAcctKey(accountId), { score: at, member: id });
  return { ok: true, scheduled: doc };
}

/** Détail d'un examen programmé — null s'il n'appartient pas au compte. */
export async function getScheduledExam(accountId, id) {
  if (!accountId || !id) return null;
  const doc = await getRedis().get(schedKey(id));
  if (!doc || doc.accountId !== accountId) return null;
  return doc;
}

/**
 * Examens à venir, du plus proche au plus lointain — l'ordre utile pour un
 * planning. Noter qu'il est l'INVERSE de celui des historiques : on lit donc
 * sans `rev`, avec les bornes dans l'ordre naturel (min, max).
 */
export async function listUpcoming(accountId, limit = 50, from = now()) {
  if (!accountId) return [];
  const ids = await getRedis().zrange(schedAcctKey(accountId), from, "+inf", {
    byScore: true,
    offset: 0,
    count: Math.max(1, Math.min(Number(limit) || 50, 200)),
  });
  return loadSummaries(ids, (a, b) => a.startsAt - b.startsAt);
}

/**
 * Examens programmés déjà passés, du plus récent au plus ancien. `rev` exige
 * ses bornes dans l'ordre inverse (cf. src/lib/indexes.js).
 */
export async function listPast(accountId, limit = 50, until = now()) {
  if (!accountId) return [];
  const ids = await getRedis().zrange(schedAcctKey(accountId), until, "-inf", {
    byScore: true,
    rev: true,
    offset: 0,
    count: Math.max(1, Math.min(Number(limit) || 50, 200)),
  });
  return loadSummaries(ids, (a, b) => b.startsAt - a.startsAt);
}

async function loadSummaries(ids, sort) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const docs = await getRedis().mget(...ids.map(schedKey));
  return docs.filter(Boolean).map(summarizeScheduled).sort(sort);
}

export async function countScheduled(accountId) {
  if (!accountId) return 0;
  return Number(await getRedis().zcard(schedAcctKey(accountId))) || 0;
}

/**
 * Annule un examen programmé et libère son code.
 *
 * Refusé une fois la salle ouverte : à ce stade des élèves peuvent déjà être
 * inscrits, et le code doit rester réservé pour que la salle vivante ne se
 * fasse pas voler son identifiant.
 */
export async function cancelScheduledExam(accountId, id) {
  const doc = await getScheduledExam(accountId, id);
  if (!doc) return { ok: false, status: 404, error: "Examen introuvable." };
  if (doc.status === SCHED_OUVERT) {
    return {
      ok: false,
      status: 409,
      error: "Cet examen est déjà ouvert. Terminez-le depuis la salle.",
    };
  }
  const redis = getRedis();
  doc.status = SCHED_ANNULE;
  await redis.set(schedKey(id), doc);
  await redis.zrem(schedAcctKey(accountId), id);
  await releaseCode(doc.code);
  return { ok: true };
}

/**
 * Le solde couvre-t-il cet examen ? Sert à prévenir le formateur AVANT
 * l'échéance : une salle qui s'ouvre toute seule n'a personne pour recharger.
 */
export async function scheduledAffordability(accountId, doc) {
  if (doc.quiz?.mode !== "examen") return { required: false };
  const priceAr = examPriceAr(doc.quiz.mode, doc.quiz.capacity);
  const account = await getAccountById(accountId);
  const balanceAr = account?.balanceAr || 0;
  return {
    required: true,
    priceAr,
    balanceAr,
    affordable: canAfford(balanceAr, priceAr),
  };
}

/* ------------------------------------------------------------------ */
/* Ouverture automatique                                               */
/* ------------------------------------------------------------------ */

/**
 * Consulte (et fait avancer si l'heure est venue) un examen programmé depuis
 * son code. Appelée par les participants comme par le formateur.
 *
 * Renvoie une `phase` :
 *   `attente` — avant l'heure : on affiche un compte à rebours
 *   `ouvert`  — la salle existe, on peut s'inscrire ou jouer
 *   `annule`  — l'examen a été annulé
 *   `bloque`  — l'heure est passée mais la salle n'a pas pu s'ouvrir
 *               (solde insuffisant). Volontairement NON définitif : le
 *               formateur recharge, et l'accès suivant ouvre la salle.
 */
export async function openScheduledIfDue(code) {
  const id = await resolveReservedCode(code);
  if (!id) return { ok: false, status: 404, error: "Code inconnu." };

  const redis = getRedis();
  const doc = await redis.get(schedKey(id));
  if (!doc) return { ok: false, status: 404, error: "Examen introuvable." };
  if (doc.status === SCHED_ANNULE) {
    return { ok: true, phase: "annule", code, title: doc.quiz?.title || null };
  }

  const t = now();
  if (t < doc.startsAt) {
    return {
      ok: true,
      phase: "attente",
      code,
      title: doc.quiz?.title || null,
      className: doc.className,
      startsAt: doc.startsAt,
      autoStartAt: doc.autoStartAt,
      registrationWindowMin: doc.registrationWindowMin,
      serverNow: t,
    };
  }

  // L'heure est venue. La salle existe-t-elle déjà ?
  let meta = await getMeta(code);

  if (!meta) {
    const { result } = await withLock(`lock:sched:${id}`, async () => {
      // Re-lecture SOUS verrou : entre le test ci-dessus et l'acquisition, un
      // autre appel a pu créer la salle. Sans cette seconde lecture, trente
      // téléphones qui pollent créeraient trente salles.
      const deja = await getMeta(code);
      if (deja) return { meta: deja };
      return { meta: await materialize(doc) };
    });
    meta = result?.meta || (await getMeta(code));
    // Verrou non obtenu et toujours rien : le gagnant est en train d'écrire,
    // le prochain sondage verra la salle. On fait patienter plutôt que
    // d'afficher une erreur.
    if (!meta) {
      return { ok: true, phase: "attente", code, startsAt: doc.startsAt, serverNow: t };
    }
  }

  // La salle est là. Reste à lancer le chrono quand la fenêtre d'inscription
  // est écoulée — même mécanique, même verrou.
  if (deriveStatus(meta) === "lobby" && t >= doc.autoStartAt) {
    const { result } = await withLock(`lock:schedstart:${id}`, async () => {
      const frais = await getMeta(code);
      if (!frais || deriveStatus(frais) !== "lobby") return { started: false };
      return { started: true, res: await startGame(code) };
    });
    // Solde insuffisant : la salle existe mais le chrono ne part pas. On le
    // dit, sans rien casser — une recharge suffit à débloquer.
    if (result?.res && result.res.ok === false && result.res.status === 402) {
      return {
        ok: true,
        phase: "bloque",
        code,
        title: doc.quiz?.title || null,
        reason: "solde",
        priceAr: result.res.priceAr,
        serverNow: t,
      };
    }
    meta = (await getMeta(code)) || meta;
  }

  return {
    ok: true,
    phase: "ouvert",
    code,
    title: doc.quiz?.title || null,
    className: doc.className,
    status: deriveStatus(meta),
    autoStartAt: doc.autoStartAt,
    serverNow: t,
  };
}

/**
 * Crée la salle d'un examen programmé et y pose son quiz. Appelée uniquement
 * sous verrou.
 */
async function materialize(doc) {
  const meta = await createRoom("Formateur", doc.accountId, { code: doc.code });
  const res = await setQuiz(
    doc.code,
    { ...doc.quiz, classId: doc.classId, className: doc.className },
    { rosterFallback: doc.rosterSnapshot },
  );
  if (!res.ok) {
    // Un quiz refusé à l'ouverture signifie que les règles ont changé depuis
    // la programmation. On laisse la salle en lobby sans quiz : le formateur
    // verra le problème, plutôt que de voir un examen disparaître.
    console.warn(`[scheduled] quiz refusé à l'ouverture de ${doc.code} : ${res.error}`);
  }

  const redis = getRedis();
  doc.status = SCHED_OUVERT;
  doc.openedAt = now();
  await redis.set(schedKey(doc.id), doc);
  // Compteur d'usage du quiz d'origine (ne fait jamais échouer l'ouverture).
  await markQuizUsed(doc.accountId, doc.quizId);
  return (await getMeta(doc.code)) || meta;
}

import { getRedis } from "./redis.js";
import { generateCode, generateId, generateVerifyCode } from "./code.js";
import {
  isAnswerCorrect,
  computePoints,
  computeNote,
  rankParticipants,
  getPodium,
  refMsForQuiz,
} from "./scoring.js";
import {
  normalizeMode,
  normalizeCapacity,
  maxParticipants,
  examPriceAr,
  MODE_LIBRE,
  LIBRE_MAX,
} from "./exam.js";
import { getAccountById, debit } from "./accounts.js";
import { canAfford } from "./wallet.js";
import { saveExamRecord } from "./history.js";
import { examAggregate } from "./analytics.js";
import { getClass } from "./classrooms.js";
import { withLock } from "./lock.js";
import { indexPlay, touchLastSeen } from "./indexes.js";

// Durée de vie d'une salle dans Redis (auto-suppression = côté « éphémère »).
const ROOM_TTL_SEC = 2 * 60 * 60; // 2h

const metaKey = (code) => `room:${code}:meta`;
const playerIdsKey = (code) => `room:${code}:playerIds`;
const playerKey = (code, id) => `room:${code}:player:${id}`;

const now = () => Date.now();

/* ------------------------------------------------------------------ */
/* Statut dérivé                                                       */
/* ------------------------------------------------------------------ */

/** Le quiz comporte-t-il au moins une question à réponse libre (à corriger) ? */
export function quizHasFree(quiz) {
  return !!quiz?.questions?.some((q) => q.type === "free");
}

/**
 * Statut effectif d'une salle. La fin du chrono est DÉRIVÉE des timestamps :
 * pas besoin de cron pour clôturer une partie sur Vercel.
 *
 * Avec des réponses libres, la fin du chrono n'achève PAS la session : elle passe
 * en « review » (le formateur valide chaque réponse libre) jusqu'à la finalisation
 * explicite (`finalizedAt`), qui seule débloque le classement et les notes.
 */
export function deriveStatus(meta, ts = now()) {
  if (!meta) return null;
  if (meta.finalizedAt) return "ended";
  if (meta.status === "running" && meta.startedAt) {
    const chronoEnd = meta.startedAt + meta.durationMs;
    const endedByHost = meta.endedAt && ts >= meta.endedAt;
    if (!endedByHost && ts <= chronoEnd) return "running";
    return quizHasFree(meta.quiz) ? "review" : "ended";
  }
  return meta.status;
}

/* ------------------------------------------------------------------ */
/* Salle / meta                                                        */
/* ------------------------------------------------------------------ */

export async function createRoom(hostName, hostAccountId = null) {
  const redis = getRedis();
  let code;
  // Évite les collisions de code (rare, mais on vérifie).
  for (let attempt = 0; attempt < 8; attempt++) {
    code = generateCode();
    const exists = await redis.exists(metaKey(code));
    if (!exists) break;
  }
  const meta = {
    code,
    hostName: String(hostName || "").slice(0, 40) || "Formateur",
    hostAccountId: hostAccountId || null,
    status: "lobby",
    quiz: null,
    startedAt: null,
    durationMs: 0,
    finalizedAt: null,
    endedAt: null,
    settled: null,
    createdAt: now(),
  };
  await redis.set(metaKey(code), meta, { ex: ROOM_TTL_SEC });
  return meta;
}

export async function getMeta(code) {
  const redis = getRedis();
  return (await redis.get(metaKey(code))) || null;
}

async function saveMeta(meta) {
  const redis = getRedis();
  await redis.set(metaKey(meta.code), meta, { ex: ROOM_TTL_SEC });
}

/** Valide la structure d'un quiz. Retourne { ok, error? }. */
export function validateQuiz(quiz) {
  if (!quiz || typeof quiz !== "object") return { ok: false, error: "Quiz manquant." };
  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0)
    return { ok: false, error: "Au moins une question est requise." };
  if (!Number(quiz.totalDurationSec) || Number(quiz.totalDurationSec) <= 0)
    return { ok: false, error: "Le temps total doit être supérieur à 0." };
  for (const [i, q] of quiz.questions.entries()) {
    if (!q.text || !String(q.text).trim())
      return { ok: false, error: `Question ${i + 1} : texte manquant.` };
    // Réponse libre : réservée au mode Examen ; pas de réponses prédéfinies.
    if (q.type === "free") {
      if (normalizeMode(quiz.mode) !== "examen")
        return {
          ok: false,
          error: `Question ${i + 1} : la réponse libre nécessite le mode Examen.`,
        };
      continue;
    }
    if (!Array.isArray(q.answers) || q.answers.length < 2)
      return { ok: false, error: `Question ${i + 1} : au moins deux réponses.` };
    const nbCorrect = q.answers.filter((a) => a.correct).length;
    if (nbCorrect < 1)
      return { ok: false, error: `Question ${i + 1} : au moins une bonne réponse.` };
    if (q.type === "single" && nbCorrect > 1)
      return {
        ok: false,
        error: `Question ${i + 1} : une seule bonne réponse en choix unique.`,
      };
    for (const a of q.answers) {
      if (!a.text || !String(a.text).trim())
        return { ok: false, error: `Question ${i + 1} : une réponse est vide.` };
    }
  }
  return { ok: true };
}

/** Normalise un quiz reçu du client (ids, types, bornes). */
function sanitizeQuiz(quiz) {
  return {
    title: String(quiz.title || "Quiz").slice(0, 120),
    mode: normalizeMode(quiz.mode),
    capacity: normalizeCapacity(quiz.capacity),
    totalDurationSec: Math.max(1, Math.round(Number(quiz.totalDurationSec) || 0)),
    questions: quiz.questions.map((q) => {
      const type =
        q.type === "multiple" ? "multiple" : q.type === "free" ? "free" : "single";
      const base = {
        id: q.id || generateId("q"),
        text: String(q.text).slice(0, 500),
        type,
        basePoints: Math.max(1, Math.round(Number(q.basePoints) || 1000)),
      };
      if (type === "free") {
        // Pas de réponses prédéfinies ; `reference` = corrigé indicatif (formateur).
        return { ...base, reference: String(q.reference || "").slice(0, 240), answers: [] };
      }
      return {
        ...base,
        answers: q.answers.map((a) => ({
          id: a.id || generateId("a"),
          text: String(a.text).slice(0, 240),
          color: typeof a.color === "string" ? a.color : "#4f46e5",
          correct: !!a.correct,
        })),
      };
    }),
  };
}

export async function setQuiz(code, quiz) {
  const meta = await getMeta(code);
  if (!meta) return { ok: false, error: "Salle introuvable." };
  if (deriveStatus(meta) !== "lobby")
    return { ok: false, error: "Le quiz ne peut plus être modifié." };
  const valid = validateQuiz(quiz);
  if (!valid.ok) return valid;
  meta.quiz = sanitizeQuiz(quiz);
  // Examen nominatif : on fige le roster de la classe choisie dans le quiz.
  if (meta.quiz.mode === "examen" && quiz.classId && meta.hostAccountId) {
    const cls = await getClass(meta.hostAccountId, quiz.classId);
    if (cls) {
      meta.quiz.classId = cls.id;
      meta.quiz.className = cls.name;
      meta.quiz.roster = cls.students;
    }
  }
  await saveMeta(meta);
  return { ok: true };
}

/**
 * Repli en mode Libre quand le solde ne permet pas de lancer l'examen : le
 * formateur sauve son cours au lieu de renvoyer sa classe. Gratuit, donc sans
 * débit — mais le mode Libre a ses limites, d'où les deux garde-fous.
 */
export async function switchToLibre(code) {
  const meta = await getMeta(code);
  if (!meta) return { ok: false, status: 404, error: "Salle introuvable." };
  if (!meta.quiz) return { ok: false, status: 400, error: "Aucun quiz configuré." };
  if (deriveStatus(meta) !== "lobby")
    return { ok: false, status: 400, error: "La partie a déjà démarré." };
  if (meta.quiz.mode === MODE_LIBRE) return { ok: true, alreadyLibre: true };

  // Le mode Libre ne sait pas corriger de réponse libre : basculer casserait
  // le quiz. Mieux vaut refuser explicitement que dégrader en silence.
  if (quizHasFree(meta.quiz))
    return {
      ok: false,
      status: 409,
      error: "Ce quiz contient des réponses libres, réservées au mode Examen.",
    };

  // Le mode Libre plafonne la salle : refuser si la classe dépasse déjà.
  const count = (await listPlayers(code)).length;
  if (count > LIBRE_MAX)
    return {
      ok: false,
      status: 409,
      error: `Le mode Libre est limité à ${LIBRE_MAX} participants (${count} déjà inscrits).`,
    };

  meta.quiz.mode = MODE_LIBRE;
  await saveMeta(meta);
  return { ok: true };
}

export async function startGame(code) {
  const meta = await getMeta(code);
  if (!meta) return { ok: false, error: "Salle introuvable." };
  if (!meta.quiz) return { ok: false, error: "Aucun quiz configuré." };
  if (deriveStatus(meta) !== "lobby")
    return { ok: false, error: "La partie a déjà démarré." };

  // Examen : exiger un solde suffisant au lancement (débit réel en fin de session).
  if (meta.quiz.mode === "examen" && meta.hostAccountId) {
    const account = await getAccountById(meta.hostAccountId);
    const priceAr = examPriceAr(meta.quiz.mode, meta.quiz.capacity);
    if (!account || !canAfford(account.balanceAr, priceAr))
      return {
        ok: false,
        status: 402,
        error: "Solde insuffisant pour lancer cet examen.",
        priceAr,
        balanceAr: account?.balanceAr || 0,
      };
  }

  meta.status = "running";
  meta.startedAt = now();
  meta.durationMs = meta.quiz.totalDurationSec * 1000;
  meta.playId = generateId("play");
  await saveMeta(meta);

  // Trace durable de la partie — APRÈS la sauvegarde, pour qu'elle ne puisse
  // rien empêcher. C'est le seul endroit où le mode Libre et les hôtes non
  // connectés laissent une trace : les salles expirent en 2 h et seuls les
  // examens payants sont archivés. `indexPlay` avale ses propres erreurs.
  await indexPlay({
    id: meta.playId,
    code: meta.code,
    mode: meta.quiz.mode,
    capacity: meta.quiz.capacity,
    hostAccountId: meta.hostAccountId,
    startedAt: meta.startedAt,
  });
  await touchLastSeen(meta.hostAccountId, meta.startedAt);

  return { ok: true, startedAt: meta.startedAt, durationMs: meta.durationMs };
}

/** Fin de session manuelle par le formateur (« Terminer l'examen »). */
export async function endSession(code) {
  const meta = await getMeta(code);
  if (!meta) return { ok: false, status: 404, error: "Salle introuvable." };
  if (meta.status !== "running" || !meta.startedAt)
    return { ok: false, status: 409, error: "Aucune session en cours." };
  if (!meta.endedAt) {
    meta.endedAt = now();
    await saveMeta(meta);
  }
  return { ok: true, endedAt: meta.endedAt };
}

/* ------------------------------------------------------------------ */
/* Joueurs                                                             */
/* ------------------------------------------------------------------ */

export async function joinRoom(code) {
  const meta = await getMeta(code);
  if (!meta) return { ok: false, status: 404, error: "Salle introuvable." };
  if (deriveStatus(meta) !== "lobby")
    return { ok: false, status: 409, error: "La partie a déjà commencé." };
  return { ok: true };
}

export async function registerPlayer(code, pseudo, studentId = null) {
  const redis = getRedis();
  const meta = await getMeta(code);
  if (!meta) return { ok: false, status: 404, error: "Salle introuvable." };
  if (deriveStatus(meta) !== "lobby")
    return { ok: false, status: 409, error: "Les inscriptions sont closes." };

  const roster = meta.quiz?.roster;
  let clean;
  let sid = null;
  if (Array.isArray(roster) && roster.length > 0) {
    // Examen nominatif : il faut choisir un élève du roster, une seule fois.
    const student = roster.find((s) => s.id === studentId);
    if (!student)
      return { ok: false, status: 400, error: "Choisissez votre nom dans la liste." };
    const already = (await listPlayers(code)).some((p) => p.studentId === student.id);
    if (already)
      return { ok: false, status: 409, error: "Cet élève a déjà rejoint la salle." };
    clean = student.name;
    sid = student.id;
  } else {
    clean = String(pseudo || "").trim().slice(0, 30);
    if (!clean) return { ok: false, status: 400, error: "Pseudo requis." };
  }

  const cap = maxParticipants(meta.quiz?.mode, meta.quiz?.capacity);
  if (cap !== null) {
    const current = (await redis.smembers(playerIdsKey(code))).length;
    if (current >= cap)
      return {
        ok: false,
        status: 409,
        error: `Salle pleine (max ${cap} participants).`,
      };
  }

  const id = generateId("p");
  const player = { id, pseudo: clean, studentId: sid, score: 0, answered: {}, shownAt: {} };
  await redis.set(playerKey(code, id), player, { ex: ROOM_TTL_SEC });
  await redis.sadd(playerIdsKey(code), id);
  await redis.expire(playerIdsKey(code), ROOM_TTL_SEC);
  return { ok: true, playerId: id, pseudo: clean };
}

export async function getPlayer(code, playerId) {
  const redis = getRedis();
  return (await redis.get(playerKey(code, playerId))) || null;
}

async function savePlayer(code, player) {
  const redis = getRedis();
  await redis.set(playerKey(code, player.id), player, { ex: ROOM_TTL_SEC });
}

export async function listPlayers(code) {
  const redis = getRedis();
  const ids = await redis.smembers(playerIdsKey(code));
  if (!ids || ids.length === 0) return [];
  const keys = ids.map((id) => playerKey(code, id));
  const players = await redis.mget(...keys);
  return players.filter(Boolean);
}

/** Liste légère pour le lobby (pas de données de score sensibles). */
export async function listParticipants(code) {
  const players = await listPlayers(code);
  return players.map((p) => ({
    playerId: p.id,
    pseudo: p.pseudo,
    studentId: p.studentId || null,
  }));
}

/* ------------------------------------------------------------------ */
/* Déroulé du jeu                                                      */
/* ------------------------------------------------------------------ */

/** Horodatage serveur de l'affichage d'une question (barème de rapidité fiable). */
export async function revealQuestion(code, playerId, questionId) {
  const meta = await getMeta(code);
  if (!meta || deriveStatus(meta) !== "running")
    return { ok: false, error: "Partie non active." };
  const player = await getPlayer(code, playerId);
  if (!player) return { ok: false, error: "Joueur inconnu." };
  if (!player.shownAt[questionId]) {
    player.shownAt[questionId] = now();
    await savePlayer(code, player);
  }
  return { ok: true };
}

export async function submitAnswer(code, playerId, questionId, answerIds, text) {
  const meta = await getMeta(code);
  if (!meta) return { ok: false, status: 404, error: "Salle introuvable." };
  if (deriveStatus(meta) !== "running")
    return { ok: false, status: 409, error: "Le temps est écoulé." };

  const question = meta.quiz?.questions.find((q) => q.id === questionId);
  if (!question) return { ok: false, status: 400, error: "Question inconnue." };

  const player = await getPlayer(code, playerId);
  if (!player) return { ok: false, status: 404, error: "Joueur inconnu." };
  if (player.answered[questionId])
    return { ok: false, status: 409, error: "Question déjà répondue." };

  const shownAt = player.shownAt[questionId] || meta.startedAt;
  const timeMs = now() - shownAt;

  // Réponse libre : on enregistre le texte « en attente » ; le formateur la
  // validera après le chrono. Aucun point tant qu'elle n'est pas validée.
  if (question.type === "free") {
    player.answered[questionId] = {
      text: String(text || "").trim().slice(0, 500),
      correct: null,
      timeMs,
      points: 0,
      pending: true,
    };
    await savePlayer(code, player);
    return { ok: true, pending: true };
  }

  const refMs = refMsForQuiz(
    meta.quiz.totalDurationSec,
    meta.quiz.questions.length,
  );
  const correct = isAnswerCorrect(question, answerIds);
  const points = computePoints({
    correct,
    timeMs,
    refMs,
    basePoints: question.basePoints,
  });

  player.answered[questionId] = {
    answerIds: Array.isArray(answerIds) ? answerIds : [],
    correct,
    timeMs,
    points,
  };
  player.score += points;
  await savePlayer(code, player);

  return { ok: true, correct, points, score: player.score };
}

/* ------------------------------------------------------------------ */
/* Correction des réponses libres (formateur)                          */
/* ------------------------------------------------------------------ */

/** Recalcule le score de jeu d'un joueur depuis ses réponses (anti-dérive). */
function sumPoints(player) {
  return Object.values(player.answered || {}).reduce(
    (s, a) => s + (Number(a.points) || 0),
    0,
  );
}

/** Le formateur valide (true) ou refuse (false) une réponse libre. */
export async function gradeFreeAnswer(code, playerId, questionId, correct) {
  const meta = await getMeta(code);
  if (!meta) return { ok: false, status: 404, error: "Salle introuvable." };
  if (meta.finalizedAt)
    return { ok: false, status: 409, error: "Session déjà finalisée." };

  const question = meta.quiz?.questions.find((q) => q.id === questionId);
  if (!question || question.type !== "free")
    return { ok: false, status: 400, error: "Question libre inconnue." };

  const player = await getPlayer(code, playerId);
  if (!player) return { ok: false, status: 404, error: "Joueur inconnu." };
  const entry = player.answered?.[questionId];
  if (!entry) return { ok: false, status: 400, error: "Aucune réponse à valider." };

  const isCorrect = !!correct;
  const refMs = refMsForQuiz(
    meta.quiz.totalDurationSec,
    meta.quiz.questions.length,
  );
  entry.correct = isCorrect;
  entry.pending = false;
  entry.points = computePoints({
    correct: isCorrect,
    timeMs: entry.timeMs,
    refMs,
    basePoints: question.basePoints,
  });
  player.answered[questionId] = entry;
  player.score = sumPoints(player);
  await savePlayer(code, player);

  return { ok: true, correct: isCorrect, points: entry.points, score: player.score };
}

/** Finalise la session : fige le classement et débloque les notes. */
export async function finalizeSession(code) {
  const meta = await getMeta(code);
  if (!meta) return { ok: false, status: 404, error: "Salle introuvable." };
  if (!meta.startedAt)
    return { ok: false, status: 409, error: "La partie n'a pas démarré." };
  if (meta.finalizedAt) return { ok: true, alreadyFinalized: true };
  meta.finalizedAt = now();
  await saveMeta(meta);
  return { ok: true, finalizedAt: meta.finalizedAt };
}

/** Données de correction : réponses libres groupées par question (vue formateur). */
export async function getReviewData(code) {
  const meta = await getMeta(code);
  if (!meta) return null;
  const freeQs = (meta.quiz?.questions || []).filter((q) => q.type === "free");
  const players = await listPlayers(code);
  const questions = freeQs.map((q) => ({
    id: q.id,
    text: q.text,
    reference: q.reference || "",
    basePoints: q.basePoints,
    submissions: players
      .map((p) => {
        const entry = p.answered?.[q.id];
        if (!entry) return null;
        return {
          playerId: p.id,
          pseudo: p.pseudo,
          text: entry.text || "",
          correct: entry.correct ?? null, // null = en attente de validation
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.pseudo.localeCompare(b.pseudo)),
  }));
  const pending = questions.reduce(
    (n, q) => n + q.submissions.filter((s) => s.correct === null).length,
    0,
  );
  return {
    status: deriveStatus(meta),
    code: meta.code,
    title: meta.quiz?.title || "Quiz",
    finalized: !!meta.finalizedAt,
    questions,
    pending,
  };
}

/* ------------------------------------------------------------------ */
/* Résultats                                                           */
/* ------------------------------------------------------------------ */

export async function getLeaderboard(code) {
  const meta = await getMeta(code);
  if (!meta) return null;
  const players = await listPlayers(code);
  const ranked = rankParticipants(
    players.map((p) => ({
      id: p.id,
      pseudo: p.pseudo,
      studentId: p.studentId || null,
      score: p.score,
      nbCorrect: Object.values(p.answered || {}).filter((a) => a.correct).length,
    })),
  );
  const nbQuestions = meta.quiz?.questions.length || 0;
  const withNote = ranked.map((p) => ({
    ...p,
    note: computeNote(p.nbCorrect, nbQuestions),
  }));

  const status = deriveStatus(meta);
  const mode = meta.quiz?.mode || "libre";
  const capacity = meta.quiz?.capacity || "small";
  const priceAr = examPriceAr(mode, capacity);

  // Stub de débit : à la clôture d'un Examen, on enregistre l'intention
  // (le débit réel arrive avec le wallet/compte ; `charged` reste false).
  //
  // Cet endpoint est pollé par le host ET chaque participant dès la fin de
  // partie (thundering herd) : sans verrou, plusieurs requêtes concurrentes
  // liraient toutes `meta.settled === null` avant qu'aucune ne persiste,
  // débitant/enregistrant l'examen en double. Le verrou Redis (`withLock`)
  // sérialise ce bloc entre invocations ; une seule requête gagne, les
  // autres voient l'état posé par le gagnant au prochain poll (≤1.5 s).
  if (status === "ended" && mode === "examen" && !meta.settled) {
    const { locked, result } = await withLock(`settle-lock:${code}`, async () => {
      const fresh = await getMeta(code);
      if (!fresh || fresh.settled) return fresh?.settled || null;

      let charged = false;
      let verifyCode = null;
      if (fresh.hostAccountId) {
        const d = await debit(fresh.hostAccountId, priceAr);
        charged = d.ok;
        // Snapshot durable dans l'historique du compte (hors TTL).
        const agg = examAggregate(withNote);
        verifyCode = generateVerifyCode();
        await saveExamRecord({
          id: generateId("ex"),
          accountId: fresh.hostAccountId,
          code: fresh.code,
          hostName: fresh.hostName || null,
          verifyCode,
          title: fresh.quiz?.title || "Quiz",
          mode,
          capacity,
          classId: fresh.quiz?.classId || null,
          className: fresh.quiz?.className || null,
          priceAr,
          charged,
          nbQuestions,
          participantCount: withNote.length,
          avgNote: agg.avgNote,
          avgScore: agg.avgScore,
          topScore: agg.topScore,
          endedAt: now(),
          leaderboard: withNote,
          podium: getPodium(withNote),
        });
      }
      fresh.settled = { amountAr: priceAr, currency: "MGA", at: now(), charged, verifyCode };
      await saveMeta(fresh);
      return fresh.settled;
    });
    if (locked && result) meta.settled = result;
    // Verrou non obtenu : une autre requête règle (ou a réglé) la clôture
    // à l'instant même ; on renvoie l'état courant tel quel.
  }

  return {
    status,
    code: meta.code,
    title: meta.quiz?.title || "Quiz",
    mode,
    capacity,
    priceAr,
    settled: meta.settled || null,
    verifyCode: meta.settled?.verifyCode || null,
    leaderboard: withNote,
    podium: getPodium(withNote),
    nbQuestions,
  };
}

/** Résultat personnel d'un participant : score, note /20, rang, total joueurs. */
export async function getMe(code, playerId) {
  const board = await getLeaderboard(code);
  if (!board) return null;
  const me = board.leaderboard.find((p) => p.id === playerId);
  if (!me) return null;
  return {
    score: me.score,
    note: me.note,
    rank: me.rank,
    total: board.leaderboard.length,
    nbCorrect: me.nbCorrect,
    nbQuestions: board.nbQuestions,
    status: board.status,
  };
}

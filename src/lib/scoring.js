/**
 * Logique de scoring — fonctions PURES, sans I/O, testables avec `node --test`.
 *
 * Modèle : score de jeu (style Kahoot, justesse + rapidité) ET note /20
 * (purement académique, basée sur le % de bonnes réponses). Les deux sont distincts.
 */

/**
 * Temps de référence par question (ms) à partir du temps total du quiz.
 * Sert de barème de rapidité : répondre en `refMs` rapporte la moitié des points.
 */
export function refMsForQuiz(totalDurationSec, nbQuestions) {
  const n = Number(nbQuestions) || 0;
  if (n <= 0) return Number(totalDurationSec) * 1000;
  return (Number(totalDurationSec) * 1000) / n;
}

/**
 * Une réponse est correcte si l'ensemble sélectionné == l'ensemble des bonnes
 * réponses (exact, pas de crédit partiel). Valable pour 'single' et 'multiple'.
 */
export function isAnswerCorrect(question, answerIds) {
  const correct = new Set(
    question.answers.filter((a) => a.correct).map((a) => a.id),
  );
  const selected = new Set(answerIds || []);
  if (correct.size !== selected.size) return false;
  for (const id of selected) {
    if (!correct.has(id)) return false;
  }
  return selected.size > 0;
}

/**
 * Normalise un texte pour comparaison : minuscules, sans accents, espaces
 * réduits. Permet d'accepter « antananarivo » ou « Antananarivo  » pour
 * « Antananarivo » sans que le formateur ait à lister ces variantes.
 */
export function normalizeShortText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // diacritiques
    .replace(/\s+/g, " ");
}

/**
 * Réponse courte : correcte si elle correspond à l'une des réponses acceptées
 * listées par le formateur (comparaison normalisée).
 *
 * Volontairement SANS correction orthographique approximative : sur une
 * évaluation notée, mieux vaut un refus prévisible — que le formateur peut
 * rattraper en ajoutant une variante — qu'un point accordé par erreur.
 */
export function isShortAnswerCorrect(question, text) {
  const given = normalizeShortText(text);
  if (!given) return false;
  return (question?.accepted || []).some((a) => normalizeShortText(a) === given);
}

/**
 * Convertit une saisie en nombre. Accepte la virgule décimale (usage
 * francophone) et les espaces de milliers. Retourne `null` si ce n'est pas un
 * nombre — un `null` ne vaut jamais 0.
 */
export function parseNumericAnswer(value) {
  const cleaned = String(value ?? "")
    .replace(/[\s  ]/g, "")
    .replace(",", ".");
  if (!cleaned || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Numérique : correct si l'écart à la valeur attendue tient dans la tolérance. */
export function isNumericAnswerCorrect(question, text) {
  const given = parseNumericAnswer(text);
  if (given === null) return false;
  const expected = Number(question?.expected);
  if (!Number.isFinite(expected)) return false;
  const tolerance = Math.abs(Number(question?.tolerance) || 0);
  return Math.abs(given - expected) <= tolerance;
}

/**
 * Points pour une réponse :
 *   - mauvaise → 0
 *   - bonne → basePoints * (1 - 0.5 * min(timeMs/refMs, 1))
 *     (instantané ≈ basePoints, à refMs ou au-delà = basePoints/2)
 */
export function computePoints({ correct, timeMs, refMs, basePoints }) {
  if (!correct) return 0;
  const base = Number(basePoints) || 0;
  const ref = Number(refMs) || 1;
  const t = Math.max(0, Number(timeMs) || 0);
  const factor = 1 - 0.5 * Math.min(t / ref, 1);
  return Math.round(base * factor);
}

/** Note /20 = (bonnes réponses / total) * 20, arrondie à une décimale. */
export function computeNote(nbCorrect, nbQuestions) {
  const n = Number(nbQuestions) || 0;
  if (n <= 0) return 0;
  return Math.round((Number(nbCorrect) / n) * 20 * 10) / 10;
}

/**
 * Trie les participants par score décroissant et attribue un rang en
 * « classement compétition » (les ex æquo partagent le même rang).
 */
export function rankParticipants(players) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return sorted.map((p) => ({
    ...p,
    rank: 1 + sorted.filter((o) => o.score > p.score).length,
  }));
}

/** Podium = les 3 meilleurs scores (participants déjà triés/classés). */
export function getPodium(rankedPlayers) {
  return rankedPlayers.slice(0, 3);
}

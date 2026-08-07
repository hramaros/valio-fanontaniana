import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAnswerCorrect,
  computePoints,
  computeNote,
  rankParticipants,
  getPodium,
  refMsForQuiz,
  normalizeShortText,
  isShortAnswerCorrect,
  parseNumericAnswer,
  isNumericAnswerCorrect,
} from "./scoring.js";

const singleQuestion = {
  id: "q1",
  type: "single",
  basePoints: 1000,
  answers: [
    { id: "a", text: "A", correct: false },
    { id: "b", text: "B", correct: true },
    { id: "c", text: "C", correct: false },
  ],
};

const multiQuestion = {
  id: "q2",
  type: "multiple",
  basePoints: 1000,
  answers: [
    { id: "a", text: "A", correct: true },
    { id: "b", text: "B", correct: false },
    { id: "c", text: "C", correct: true },
    { id: "d", text: "D", correct: false },
  ],
};

test("isAnswerCorrect: single choice — bonne réponse", () => {
  assert.equal(isAnswerCorrect(singleQuestion, ["b"]), true);
});

test("isAnswerCorrect: single choice — mauvaise réponse", () => {
  assert.equal(isAnswerCorrect(singleQuestion, ["a"]), false);
});

test("isAnswerCorrect: single choice — vide = faux", () => {
  assert.equal(isAnswerCorrect(singleQuestion, []), false);
});

test("isAnswerCorrect: multi — ensemble exact = vrai", () => {
  assert.equal(isAnswerCorrect(multiQuestion, ["a", "c"]), true);
  assert.equal(isAnswerCorrect(multiQuestion, ["c", "a"]), true); // ordre indifférent
});

test("isAnswerCorrect: multi — sous-ensemble = faux (pas de crédit partiel)", () => {
  assert.equal(isAnswerCorrect(multiQuestion, ["a"]), false);
});

test("isAnswerCorrect: multi — une réponse en trop = faux", () => {
  assert.equal(isAnswerCorrect(multiQuestion, ["a", "c", "b"]), false);
});

test("computePoints: mauvaise réponse = 0", () => {
  assert.equal(
    computePoints({ correct: false, timeMs: 0, refMs: 10000, basePoints: 1000 }),
    0,
  );
});

test("computePoints: bonne réponse instantanée ≈ basePoints", () => {
  assert.equal(
    computePoints({ correct: true, timeMs: 0, refMs: 10000, basePoints: 1000 }),
    1000,
  );
});

test("computePoints: bonne réponse au temps de réf = basePoints/2", () => {
  assert.equal(
    computePoints({ correct: true, timeMs: 10000, refMs: 10000, basePoints: 1000 }),
    500,
  );
});

test("computePoints: au-delà du temps de réf, plafonné à basePoints/2", () => {
  assert.equal(
    computePoints({ correct: true, timeMs: 99999, refMs: 10000, basePoints: 1000 }),
    500,
  );
});

test("computePoints: mi-temps = 75% des points", () => {
  assert.equal(
    computePoints({ correct: true, timeMs: 5000, refMs: 10000, basePoints: 1000 }),
    750,
  );
});

test("computePoints: timeMs négatif traité comme 0", () => {
  assert.equal(
    computePoints({ correct: true, timeMs: -50, refMs: 10000, basePoints: 1000 }),
    1000,
  );
});

test("computeNote: 0 bonne réponse = 0/20", () => {
  assert.equal(computeNote(0, 4), 0);
});

test("computeNote: toutes bonnes = 20/20", () => {
  assert.equal(computeNote(4, 4), 20);
});

test("computeNote: moitié = 10/20", () => {
  assert.equal(computeNote(2, 4), 10);
});

test("computeNote: arrondi à une décimale", () => {
  assert.equal(computeNote(1, 3), 6.7);
});

test("computeNote: aucune question = 0", () => {
  assert.equal(computeNote(0, 0), 0);
});

test("rankParticipants: tri par score décroissant + rang", () => {
  const ranked = rankParticipants([
    { id: "1", pseudo: "Alice", score: 300 },
    { id: "2", pseudo: "Bob", score: 900 },
    { id: "3", pseudo: "Cara", score: 600 },
  ]);
  assert.deepEqual(
    ranked.map((p) => [p.pseudo, p.rank]),
    [
      ["Bob", 1],
      ["Cara", 2],
      ["Alice", 3],
    ],
  );
});

test("rankParticipants: égalité = même rang (classement compétition)", () => {
  const ranked = rankParticipants([
    { id: "1", pseudo: "Alice", score: 500 },
    { id: "2", pseudo: "Bob", score: 500 },
    { id: "3", pseudo: "Cara", score: 100 },
  ]);
  const ranks = Object.fromEntries(ranked.map((p) => [p.pseudo, p.rank]));
  assert.equal(ranks.Alice, 1);
  assert.equal(ranks.Bob, 1);
  assert.equal(ranks.Cara, 3); // saute le rang 2
});

test("getPodium: 3 premiers", () => {
  const ranked = rankParticipants([
    { id: "1", pseudo: "Alice", score: 300 },
    { id: "2", pseudo: "Bob", score: 900 },
    { id: "3", pseudo: "Cara", score: 600 },
    { id: "4", pseudo: "Dan", score: 100 },
  ]);
  const podium = getPodium(ranked);
  assert.deepEqual(
    podium.map((p) => p.pseudo),
    ["Bob", "Cara", "Alice"],
  );
});

test("getPodium: moins de 3 joueurs", () => {
  const ranked = rankParticipants([{ id: "1", pseudo: "Solo", score: 10 }]);
  assert.equal(getPodium(ranked).length, 1);
});

test("refMsForQuiz: temps total réparti par question", () => {
  assert.equal(refMsForQuiz(60, 4), 15000);
  assert.equal(refMsForQuiz(60, 0), 60000); // garde-fou : pas de division par 0
});

/* ------------------------------------------------------------------ */
/* Réponse courte auto-corrigée                                        */
/* ------------------------------------------------------------------ */

test("normalizeShortText : casse, accents et espaces neutralisés", () => {
  assert.equal(normalizeShortText("  Ántananarívo  "), "antananarivo");
  assert.equal(normalizeShortText("LE   Caire"), "le caire");
  assert.equal(normalizeShortText(null), "");
});

test("isShortAnswerCorrect : accepte toute variante listée", () => {
  const q = { accepted: ["Antananarivo", "Tananarive"] };
  assert.equal(isShortAnswerCorrect(q, "ANTANANARIVO"), true);
  assert.equal(isShortAnswerCorrect(q, " tananarive "), true);
  assert.equal(isShortAnswerCorrect(q, "Toamasina"), false);
});

test("isShortAnswerCorrect : une réponse vide n'est jamais juste", () => {
  assert.equal(isShortAnswerCorrect({ accepted: ["x"] }, "   "), false);
  assert.equal(isShortAnswerCorrect({ accepted: [] }, "x"), false);
});

test("isShortAnswerCorrect : pas de correction approximative", () => {
  // « Antananarivou » n'est pas accepté : sur une note, un refus prévisible
  // vaut mieux qu'un point donné par erreur (le formateur ajoute la variante).
  assert.equal(
    isShortAnswerCorrect({ accepted: ["Antananarivo"] }, "Antananarivou"),
    false,
  );
});

/* ------------------------------------------------------------------ */
/* Réponse numérique                                                   */
/* ------------------------------------------------------------------ */

test("parseNumericAnswer : virgule décimale et espaces de milliers", () => {
  assert.equal(parseNumericAnswer("3,14"), 3.14);
  assert.equal(parseNumericAnswer("3.14"), 3.14);
  assert.equal(parseNumericAnswer("1 234,5"), 1234.5);
  assert.equal(parseNumericAnswer("-7"), -7);
  assert.equal(parseNumericAnswer(",5"), 0.5);
});

test("parseNumericAnswer : rejette ce qui n'est pas un nombre", () => {
  for (const bad of ["douze", "", "  ", "12abc", "1,2,3", null, undefined]) {
    assert.equal(parseNumericAnswer(bad), null, `« ${bad} » doit être rejeté`);
  }
});

test("isNumericAnswerCorrect : tolérance appliquée dans les deux sens", () => {
  const q = { expected: 12, tolerance: 0.5 };
  assert.equal(isNumericAnswerCorrect(q, "12"), true);
  assert.equal(isNumericAnswerCorrect(q, "12,5"), true, "borne haute incluse");
  assert.equal(isNumericAnswerCorrect(q, "11,5"), true, "borne basse incluse");
  assert.equal(isNumericAnswerCorrect(q, "13"), false);
});

test("isNumericAnswerCorrect : sans tolérance, exactitude requise", () => {
  const q = { expected: 12 };
  assert.equal(isNumericAnswerCorrect(q, "12"), true);
  assert.equal(isNumericAnswerCorrect(q, "12,1"), false);
});

test("isNumericAnswerCorrect : saisie non numérique ou attendu invalide", () => {
  assert.equal(isNumericAnswerCorrect({ expected: 12 }, "douze"), false);
  assert.equal(isNumericAnswerCorrect({ expected: "abc" }, "12"), false);
});

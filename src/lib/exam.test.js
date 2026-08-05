import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMode,
  normalizeCapacity,
  maxParticipants,
  examPriceAr,
  LIBRE_MAX,
  EXAMEN_SMALL_MAX,
  WELCOME_CREDIT_AR,
} from "./exam.js";

test("normalizeMode : défaut libre, examen reconnu", () => {
  assert.equal(normalizeMode("examen"), "examen");
  assert.equal(normalizeMode("libre"), "libre");
  assert.equal(normalizeMode(undefined), "libre");
  assert.equal(normalizeMode("n'importe"), "libre");
});

test("normalizeCapacity : défaut small, unlimited reconnu", () => {
  assert.equal(normalizeCapacity("unlimited"), "unlimited");
  assert.equal(normalizeCapacity("small"), "small");
  assert.equal(normalizeCapacity(undefined), "small");
});

test("maxParticipants : Libre=10, Examen small=20, Examen unlimited=null", () => {
  assert.equal(maxParticipants("libre", undefined), LIBRE_MAX);
  assert.equal(maxParticipants("libre", "unlimited"), LIBRE_MAX); // libre ignore capacity
  assert.equal(maxParticipants("examen", "small"), EXAMEN_SMALL_MAX);
  assert.equal(maxParticipants("examen", "unlimited"), null);
});

test("examPriceAr : Libre=0, Examen small=1000, Examen unlimited=2000", () => {
  assert.equal(examPriceAr("libre", "small"), 0);
  assert.equal(examPriceAr("examen", "small"), 1000);
  assert.equal(examPriceAr("examen", "unlimited"), 2000);
});

test("WELCOME_CREDIT_AR couvre exactement un examen (≤ 20 participants)", () => {
  // Intention produit : le premier examen est offert. Si les prix changent, le
  // crédit de bienvenue doit rester un examen — ni plus, ni moins.
  assert.equal(WELCOME_CREDIT_AR, examPriceAr("examen", "small"));
});

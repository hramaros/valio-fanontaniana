import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canAfford,
  TOPUP_TEST_AR,
  TOPUP_PACKS,
  topupBonusAr,
  creditedAr,
  examsAffordable,
} from "./wallet.js";
import { PRICE_SMALL_AR } from "./exam.js";

test("canAfford : suffisant / insuffisant / égalité / zéro", () => {
  assert.equal(canAfford(5000, 1000), true);
  assert.equal(canAfford(500, 1000), false);
  assert.equal(canAfford(1000, 1000), true);
  assert.equal(canAfford(0, 0), true);
});

test("TOPUP_TEST_AR vaut 5000", () => {
  assert.equal(TOPUP_TEST_AR, 5000);
});

test("TOPUP_PACKS : le montant correspond au nombre d'examens annoncé", () => {
  for (const pack of TOPUP_PACKS) {
    assert.equal(
      pack.amountAr,
      pack.exams * PRICE_SMALL_AR,
      `le pack ${pack.exams} examens doit coûter ${pack.exams} × le prix unitaire`,
    );
  }
});

test("topupBonusAr : aucun bonus sous le premier palier", () => {
  assert.equal(topupBonusAr(0), 0);
  assert.equal(topupBonusAr(2400), 0);
  assert.equal(topupBonusAr(4999), 0);
});

test("topupBonusAr : le palier atteint donne son bonus", () => {
  assert.equal(topupBonusAr(5000), 0);
  assert.equal(topupBonusAr(20000), 2 * PRICE_SMALL_AR);
  assert.equal(topupBonusAr(50000), 8 * PRICE_SMALL_AR);
});

test("topupBonusAr : un montant libre profite du plus grand palier atteint", () => {
  assert.equal(topupBonusAr(25000), 2 * PRICE_SMALL_AR);
  assert.equal(topupBonusAr(49999), 2 * PRICE_SMALL_AR);
  assert.equal(topupBonusAr(120000), 8 * PRICE_SMALL_AR);
});

test("creditedAr : le crédit vaut le paiement plus le bonus", () => {
  assert.equal(creditedAr(5000), 5000);
  assert.equal(creditedAr(20000), 22000);
  assert.equal(creditedAr(50000), 58000);
});

test("creditedAr : montants invalides ramenés à zéro", () => {
  assert.equal(creditedAr(-100), 0);
  assert.equal(creditedAr("abc"), 0);
});

test("examsAffordable : nombre d'examens couverts par le solde", () => {
  assert.equal(examsAffordable(0), 0);
  assert.equal(examsAffordable(999), 0);
  assert.equal(examsAffordable(1000), 1);
  assert.equal(examsAffordable(5500), 5);
});

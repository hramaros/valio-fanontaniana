// Logique PURE du porte-monnaie (sans I/O), testable avec `node --test`.

import { PRICE_SMALL_AR } from "./exam.js";

// Montant de la recharge de test (en attendant le paiement réel mobile money / carte).
export const TOPUP_TEST_AR = 5000;

/** Le solde couvre-t-il le prix de l'examen ? */
export function canAfford(balanceAr, priceAr) {
  return (Number(balanceAr) || 0) >= (Number(priceAr) || 0);
}

// Packs de recharge, exprimés en EXAMENS et non en Ariary : le formateur achète
// des examens, pas une devise. Le bonus de volume est réel — il est crédité en
// plus du montant payé (voir applyTopupBonus dans payments.js), jamais une
// valeur gonflée affichée à côté du prix.
export const TOPUP_PACKS = [
  { exams: 5, amountAr: 5 * PRICE_SMALL_AR, bonusExams: 0 },
  { exams: 20, amountAr: 20 * PRICE_SMALL_AR, bonusExams: 2 },
  { exams: 50, amountAr: 50 * PRICE_SMALL_AR, bonusExams: 8 },
];

/**
 * Bonus (en Ariary) accordé pour un montant rechargé. Le palier retenu est le
 * plus grand pack atteint : un montant libre en profite aussi, sans surprise.
 */
export function topupBonusAr(amountAr) {
  const amount = Math.max(0, Math.round(Number(amountAr) || 0));
  let bonusExams = 0;
  for (const pack of TOPUP_PACKS) {
    if (amount >= pack.amountAr) bonusExams = pack.bonusExams;
  }
  return bonusExams * PRICE_SMALL_AR;
}

/** Ce qui est réellement crédité au solde : montant payé + bonus de volume. */
export function creditedAr(amountAr) {
  const amount = Math.max(0, Math.round(Number(amountAr) || 0));
  return amount + topupBonusAr(amount);
}

/** Nombre d'examens (≤ 20 participants) que couvre un solde. */
export function examsAffordable(balanceAr) {
  return Math.floor((Number(balanceAr) || 0) / PRICE_SMALL_AR);
}

import { getRedis } from "./redis.js";
import { generateId } from "./code.js";
import { credit } from "./accounts.js";
import { indexTxn } from "./indexes.js";
import { topupBonusAr } from "./wallet.js";
import { recentDocs, countScoped } from "./scopedIndex.js";

// Abstraction de paiement PROVIDER-AGNOSTIQUE.
// Une recharge = une transaction (pending → completed/failed). Le crédit du
// solde n'a lieu qu'à la complétion, une seule fois (idempotent).
//
// Pour brancher un vrai agrégateur (MVola/Orange/Airtel via un PSP, Stripe…) :
//   1. implémenter un provider { initiate(txn), handleWebhook(request) }
//   2. registerProvider("mvola", impl)
//   3. exposer le webhook sur /api/wallet/webhook/mvola (déjà en place).
// Rien d'autre ne change : la couche solde/examen reste identique.

// Les transactions sont conservées SANS TTL : ce sont des écritures
// comptables. Elles ont porté un TTL de 30 j pendant un temps, ce qui
// détruisait silencieusement l'historique de recette au-delà d'un mois —
// tout ce qui a expiré avant ce correctif est définitivement perdu.
const txnKey = (id) => `txn:${id}`;
// Index des recharges d'un compte : ZSET scoré par `createdAt`, lu par
// curseur (cf. src/lib/scopedIndex.js). C'était une liste plafonnée à 200,
// ce qui — les documents `txn:*` n'ayant pas de TTL — rendait les écritures
// au-delà inatteignables sans les supprimer. Sur de la comptabilité, après un
// premier épisode de perte silencieuse par TTL, c'était le plafond à retirer
// en premier.
export const txnAcctKey = (accountId) => `txns:acct:${accountId}`;
// Clé héritée : lecture seule, on n'y écrit plus.
export const legacyTxnHistoryKey = (accountId) => `txnHistory:${accountId}`;
// Liste blanche des champs qu'un provider peut ajouter à la transaction
// (ex. taux de change appliqué, pour audit). Un Object.assign sans filtre
// laisserait un provider — bugué ou tiers/HTTP-facing plus tard (Mvola,
// Orange…) — écraser des champs cœur (id, accountId, status…) via son
// `txnExtra`. Étendre cette liste à mesure que de nouveaux providers ont
// besoin de tracer d'autres champs.
const TXN_EXTRA_ALLOWED_KEYS = ["fxRateArPerEur", "amountEurCents"];

export const TXN_PENDING = "pending";
export const TXN_COMPLETED = "completed";
export const TXN_FAILED = "failed";

/**
 * Provider STUB : valide la recharge immédiatement (pas de vrai paiement).
 * `autoComplete: true` → la transaction est complétée dans la foulée.
 */
const providers = {
  stub: {
    async initiate(txn) {
      return { providerRef: `stub-${txn.id}`, autoComplete: true };
    },
  },
};

export function registerProvider(name, impl) {
  providers[name] = impl;
}
export function getProvider(name) {
  return providers[name] || null;
}

export async function getTransaction(id) {
  const redis = getRedis();
  return (await redis.get(txnKey(id))) || null;
}

async function saveTxn(txn) {
  await getRedis().set(txnKey(txn.id), txn);
}

/** Démarre une recharge : crée une transaction et la confie au provider. */
export async function initiateTopup(accountId, amountAr, providerName = "stub", context = {}) {
  const provider = getProvider(providerName);
  if (!provider)
    return { ok: false, status: 400, error: "Fournisseur de paiement inconnu." };
  const amount = Math.max(0, Math.round(Number(amountAr) || 0));
  if (amount <= 0)
    return { ok: false, status: 400, error: "Montant de recharge invalide." };

  const txn = {
    id: generateId("txn"),
    accountId,
    // `amountAr` est ce qui est FACTURÉ (le provider s'en sert pour le montant
    // à encaisser) ; `bonusAr` est offert en plus et n'est crédité qu'à la
    // complétion. Séparer les deux évite de facturer le bonus par accident.
    amountAr: amount,
    bonusAr: topupBonusAr(amount),
    provider: providerName,
    providerRef: null,
    status: TXN_PENDING,
    createdAt: Date.now(),
    completedAt: null,
  };
  const started = (await provider.initiate(txn, context)) || {};
  txn.providerRef = started.providerRef || null;
  // Champs additionnels du provider (ex. taux de change appliqué) — traçabilité.
  // Fusion filtrée par liste blanche : voir TXN_EXTRA_ALLOWED_KEYS ci-dessus.
  if (started.txnExtra) {
    for (const key of TXN_EXTRA_ALLOWED_KEYS) {
      if (key in started.txnExtra) txn[key] = started.txnExtra[key];
    }
  }
  await saveTxn(txn);
  // Index d'historique des recharges du compte (sans troncature).
  await getRedis().zadd(txnAcctKey(accountId), {
    score: Number(txn.createdAt) || Date.now(),
    member: txn.id,
  });
  // Index global daté, une seule fois à la création : le score est
  // `createdAt`, il ne bouge plus quand la transaction change de statut.
  await indexTxn(txn.id, txn.createdAt);

  // Provider synchrone (ex. stub) : on complète tout de suite.
  if (started.autoComplete) return completeTransaction(txn.id);

  return {
    ok: true,
    transaction: txn,
    redirectUrl: started.redirectUrl || null,
    instructions: started.instructions || null,
  };
}

/** Confirme une transaction et crédite le solde — idempotent. */
export async function completeTransaction(id) {
  const txn = await getTransaction(id);
  if (!txn) return { ok: false, status: 404, error: "Transaction introuvable." };
  if (txn.status === TXN_COMPLETED)
    return { ok: true, transaction: txn, alreadyCompleted: true };

  // Crédit = payé + bonus de volume. `|| 0` : les transactions créées avant
  // l'introduction du bonus n'ont pas le champ.
  const res = await credit(txn.accountId, txn.amountAr + (txn.bonusAr || 0));
  txn.status = TXN_COMPLETED;
  txn.completedAt = Date.now();
  await saveTxn(txn);
  return { ok: true, transaction: txn, balanceAr: res.balanceAr };
}

export async function failTransaction(id) {
  const txn = await getTransaction(id);
  if (!txn) return { ok: false, status: 404, error: "Transaction introuvable." };
  if (txn.status === TXN_PENDING) {
    txn.status = TXN_FAILED;
    await saveTxn(txn);
  }
  return { ok: true, transaction: txn };
}

/**
 * Historique des recharges d'un compte, plus récent en tête.
 *
 * Curseur : `before` (le `createdAt` du dernier élément rendu) et `afterId`
 * (son `id`). Les deux ensemble franchissent proprement une page dont la fin
 * comporte des ex æquo à la milliseconde.
 *
 * Limite assumée : deux transactions nées dans la même milliseconde sont
 * ordonnées par identifiant, pas par ordre d'insertion — il n'existe pas
 * d'ordre « juste » entre elles, et aucune n'est jamais perdue. En pratique
 * deux recharges d'un même compte sont séparées par plusieurs allers-retours
 * réseau.
 */
export async function listTransactions(
  accountId,
  limit = 50,
  { before, afterId } = {},
) {
  return recentDocs({
    zKey: txnAcctKey(accountId),
    legacyKey: legacyTxnHistoryKey(accountId),
    docKey: txnKey,
    dateField: "createdAt",
    limit,
    before,
    afterId,
  });
}

/** Nombre de recharges d'un compte (toutes statuts confondus). */
export async function countTransactions(accountId) {
  return countScoped(txnAcctKey(accountId), legacyTxnHistoryKey(accountId));
}

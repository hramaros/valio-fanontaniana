import { test } from "node:test";
import assert from "node:assert/strict";
import { setRedisClient } from "./redis.js";
import { createFakeRedis } from "./testFakeRedis.js";
import { createAccount, getAccountById } from "./accounts.js";
import {
  initiateTopup,
  completeTransaction,
  getTransaction,
  registerProvider,
  listTransactions,
} from "./payments.js";

test("initiateTopup (stub) : crédite immédiatement et marque completed", async () => {
  setRedisClient(createFakeRedis());
  const { account } = await createAccount({ email: "p@e.mg", password: "secret1" });
  const res = await initiateTopup(account.id, 5000, "stub");
  assert.equal(res.ok, true);
  assert.equal(res.transaction.status, "completed");
  assert.equal(res.balanceAr, 5000);
  assert.equal((await getAccountById(account.id)).balanceAr, 5000);
});

test("completeTransaction est idempotent (pas de double crédit)", async () => {
  setRedisClient(createFakeRedis());
  const { account } = await createAccount({ email: "p@e.mg", password: "secret1" });
  const res = await initiateTopup(account.id, 5000, "stub");
  const again = await completeTransaction(res.transaction.id);
  assert.equal(again.alreadyCompleted, true);
  assert.equal((await getAccountById(account.id)).balanceAr, 5000);
});

test("provider inconnu ou montant invalide refusés", async () => {
  setRedisClient(createFakeRedis());
  const { account } = await createAccount({ email: "p@e.mg", password: "secret1" });
  assert.equal((await initiateTopup(account.id, 5000, "inexistant")).ok, false);
  assert.equal((await initiateTopup(account.id, 0, "stub")).ok, false);
});

test("listTransactions : plus récent en tête, isolé par compte", async () => {
  setRedisClient(createFakeRedis());
  const a = (await createAccount({ email: "a@e.mg", password: "secret1" })).account;
  const b = (await createAccount({ email: "b@e.mg", password: "secret1" })).account;

  await initiateTopup(a.id, 5000, "stub");
  await initiateTopup(a.id, 20000, "stub");
  await initiateTopup(b.id, 1000, "stub");

  const listA = await listTransactions(a.id);
  assert.equal(listA.length, 2);
  assert.equal(listA[0].amountAr, 20000, "le plus récent est en tête");
  assert.equal(listA[1].amountAr, 5000);
  assert.ok(listA.every((t) => t.accountId === a.id), "isolé par compte");

  const listB = await listTransactions(b.id);
  assert.equal(listB.length, 1);
  assert.equal(listB[0].amountAr, 1000);
});

test("initiateTopup : fusionne txnExtra du provider dans la transaction", async () => {
  setRedisClient(createFakeRedis());
  const { account } = await createAccount({ email: "p@e.mg", password: "secret1" });

  registerProvider("faketest", {
    async initiate(txn, context) {
      return {
        providerRef: "ref_1",
        redirectUrl: "https://pay/x",
        txnExtra: { fxRateArPerEur: 4800, amountEurCents: 104, origin: context?.origin },
      };
    },
  });

  const res = await initiateTopup(account.id, 5000, "faketest", { origin: "https://app" });
  assert.equal(res.ok, true);
  assert.equal(res.redirectUrl, "https://pay/x");

  const txn = await getTransaction(res.transaction.id);
  assert.equal(txn.fxRateArPerEur, 4800);
  assert.equal(txn.amountEurCents, 104);
  assert.equal(txn.status, "pending", "pas d'autoComplete → reste en attente");
});

test("initiateTopup : txnExtra ne peut pas écraser les champs cœur de la transaction", async () => {
  setRedisClient(createFakeRedis());
  const { account } = await createAccount({ email: "p@e.mg", password: "secret1" });
  const other = (await createAccount({ email: "other@e.mg", password: "secret1" })).account;

  // Provider bugué/malveillant : tente d'écraser id/accountId/status via txnExtra.
  registerProvider("faketest2", {
    async initiate(txn) {
      return {
        providerRef: "ref_2",
        txnExtra: {
          id: "id-usurpé",
          accountId: other.id,
          status: "completed",
          fxRateArPerEur: 5000, // champ légitime, doit passer
        },
      };
    },
  });

  const res = await initiateTopup(account.id, 5000, "faketest2");
  assert.equal(res.ok, true);

  const txn = await getTransaction(res.transaction.id);
  assert.equal(txn.id, res.transaction.id, "id non écrasé");
  assert.equal(txn.accountId, account.id, "accountId non écrasé");
  assert.equal(txn.status, "pending", "status non écrasé par txnExtra");
  assert.equal(txn.fxRateArPerEur, 5000, "les clés autorisées passent toujours");
});

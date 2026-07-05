import { test } from "node:test";
import assert from "node:assert/strict";
import { setRedisClient } from "./redis.js";
import { createFakeRedis } from "./testFakeRedis.js";
import { setStripeClient, stripeProvider } from "./stripeProvider.js";

test("initiate : convertit Ar→centimes EUR, crée une Checkout Session, renvoie txnExtra", async () => {
  const redis = createFakeRedis();
  await redis.set("fxRate:EUR:MGA", 4800); // 4800 Ar / EUR
  setRedisClient(redis);

  let captured = null;
  setStripeClient({
    checkout: {
      sessions: {
        async create(params) {
          captured = params;
          return { id: "cs_test_1", url: "https://checkout.stripe.com/x" };
        },
      },
    },
  });

  const res = await stripeProvider.initiate(
    { id: "txn_1", accountId: "acc_1", amountAr: 5000 },
    { origin: "https://app.example" },
  );

  assert.equal(res.redirectUrl, "https://checkout.stripe.com/x");
  assert.equal(res.providerRef, "cs_test_1");
  assert.equal(res.txnExtra.fxRateArPerEur, 4800);
  assert.equal(res.txnExtra.amountEurCents, 104); // round(5000/4800*100)

  assert.equal(captured.mode, "payment");
  assert.equal(captured.line_items[0].price_data.currency, "eur");
  assert.equal(captured.line_items[0].price_data.unit_amount, 104);
  assert.equal(captured.metadata.txnId, "txn_1");
  assert.equal(captured.metadata.accountId, "acc_1");
  assert.equal(captured.success_url, "https://app.example/host/wallet?checkout=success");
  assert.equal(captured.cancel_url, "https://app.example/host/wallet?checkout=cancel");
});

function fakeRequest() {
  return {
    async text() { return "corps-brut"; },
    headers: { get() { return "sig_test"; } },
  };
}

test("handleWebhook : événement complété signé → completed", async () => {
  setStripeClient({
    webhooks: {
      constructEvent() {
        return {
          type: "checkout.session.completed",
          data: { object: { metadata: { txnId: "txn_9" } } },
        };
      },
    },
  });
  const res = await stripeProvider.handleWebhook(fakeRequest());
  assert.deepEqual(res, { ok: true, transactionId: "txn_9", completed: true });
});

test("handleWebhook : signature invalide → ok:false, jamais de crédit", async () => {
  setStripeClient({
    webhooks: {
      constructEvent() { throw new Error("signature invalide"); },
    },
  });
  const res = await stripeProvider.handleWebhook(fakeRequest());
  assert.equal(res.ok, false);
});

test("handleWebhook : autre type d'événement → ok:true sans completed", async () => {
  setStripeClient({
    webhooks: {
      constructEvent() { return { type: "payment_intent.created", data: { object: {} } }; },
    },
  });
  const res = await stripeProvider.handleWebhook(fakeRequest());
  assert.equal(res.ok, true);
  assert.equal(res.completed, undefined);
});

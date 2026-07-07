import { test } from "node:test";
import assert from "node:assert/strict";
import { setRedisClient } from "./redis.js";
import { createFakeRedis } from "./testFakeRedis.js";
import { setStripeClient, getStripeClient, stripeProvider } from "./stripeProvider.js";

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

test("handleWebhook : événement signé mais sans metadata.txnId → ok:false", async () => {
  setStripeClient({
    webhooks: {
      constructEvent() {
        return { type: "checkout.session.completed", data: { object: { metadata: {} } } };
      },
    },
  });
  const res = await stripeProvider.handleWebhook(fakeRequest());
  assert.equal(res.ok, false);
  assert.equal(res.transactionId, undefined);
});

test("getStripeClient : sans client injecté ni STRIPE_SECRET_KEY → lève une erreur explicite", () => {
  const prevKey = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  setStripeClient(null);
  try {
    assert.throws(() => getStripeClient(), /STRIPE_SECRET_KEY/);
  } finally {
    if (prevKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = prevKey;
    setStripeClient({}); // état propre pour d'éventuels tests futurs dans ce fichier
  }
});

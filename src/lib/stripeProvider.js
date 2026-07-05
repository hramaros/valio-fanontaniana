import Stripe from "stripe";
import { registerProvider } from "./payments.js";
import { getArPerEurRate } from "./fxRate.js";

// Provider de paiement Stripe (Checkout Session + webhook signé), branché sur
// l'abstraction provider-agnostique de payments.js. Le solde est en Ariary ;
// Stripe facture en EUR au taux du jour (voir fxRate.js). Le crédit du solde
// n'a lieu qu'à la réception du webhook `checkout.session.completed` signé.

let stripeClient = null;

/** Injection d'un client (tests). */
export function setStripeClient(client) {
  stripeClient = client;
}

export function getStripeClient() {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY non configurée.");
  stripeClient = new Stripe(key);
  return stripeClient;
}

export const stripeProvider = {
  async initiate(txn, context = {}) {
    const rate = await getArPerEurRate();
    const amountEurCents = Math.round((txn.amountAr / rate) * 100);
    const origin = context.origin || process.env.APP_BASE_URL || "";
    const session = await getStripeClient().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: `Recharge valio.fanontaniana — ${txn.amountAr} Ar` },
            unit_amount: amountEurCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/host/wallet?checkout=success`,
      cancel_url: `${origin}/host/wallet?checkout=cancel`,
      metadata: { txnId: txn.id, accountId: txn.accountId },
    });
    return {
      redirectUrl: session.url,
      providerRef: session.id,
      txnExtra: { fxRateArPerEur: rate, amountEurCents },
    };
  },

  async handleWebhook(request) {
    // Corps BRUT obligatoire pour la vérification de signature (jamais .json()).
    const raw = await request.text();
    const signature = request.headers.get("stripe-signature");
    let event;
    try {
      event = getStripeClient().webhooks.constructEvent(
        raw,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch {
      return { ok: false, error: "Signature webhook invalide." };
    }
    if (event.type === "checkout.session.completed") {
      const txnId = event.data.object?.metadata?.txnId;
      if (!txnId) return { ok: false, error: "metadata.txnId manquant." };
      return { ok: true, transactionId: txnId, completed: true };
    }
    return { ok: true }; // autres événements ignorés sans erreur
  },
};

registerProvider("stripe", stripeProvider);

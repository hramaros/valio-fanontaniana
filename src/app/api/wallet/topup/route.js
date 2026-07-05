import { initiateTopup } from "@/lib/payments";
import "@/lib/stripeProvider"; // enregistre le provider "stripe"
import { accountFromRequest } from "@/lib/authServer";
import { getArPerEurRate } from "@/lib/fxRate";
import { readBody, json, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

const MIN_AR = 500;
const MAX_AR = 1000000;
// Stripe refuse les paiements sous ~0,50 € (plancher documenté par devise).
// Le taux de change étant en direct, le plancher en Ariary équivalent est
// recalculé à chaque demande plutôt que figé en dur.
const STRIPE_MIN_EUR_CENTS = 50;

// Démarre une recharge Stripe : crée une Checkout Session et renvoie l'URL de
// redirection. Le crédit du solde a lieu à la réception du webhook signé.
export const POST = handler(async (request) => {
  const account = await accountFromRequest(request);
  if (!account) return json({ error: "Connexion requise." }, 401);

  const { amountAr } = await readBody(request);
  const amount = Math.round(Number(amountAr) || 0);

  const rate = await getArPerEurRate();
  const stripeMinAr = Math.ceil((STRIPE_MIN_EUR_CENTS / 100) * rate);
  const effectiveMinAr = Math.max(MIN_AR, stripeMinAr);

  if (amount < effectiveMinAr || amount > MAX_AR) {
    return json(
      {
        error: `Montant invalide (entre ${effectiveMinAr} et ${MAX_AR} Ar).`,
        minAr: effectiveMinAr,
      },
      400,
    );
  }

  const origin = new URL(request.url).origin;
  const res = await initiateTopup(account.id, amount, "stripe", { origin });
  if (!res.ok) return json({ error: res.error }, res.status || 400);
  return json({ redirectUrl: res.redirectUrl, transactionId: res.transaction?.id });
});

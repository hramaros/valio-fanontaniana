import { getProvider, completeTransaction, failTransaction } from "@/lib/payments";
import "@/lib/stripeProvider"; // enregistre le provider "stripe"
import { json, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

// Point d'entrée de confirmation pour un agrégateur réel.
// Le provider enregistré doit exposer :
//   handleWebhook(request) -> { ok, transactionId, completed?, failed?, error? }
// (vérification de signature incluse côté provider). Aucun provider réel n'est
// encore branché : ce endpoint est le point d'intégration prêt à l'emploi.
export const POST = handler(async (request, { params }) => {
  const { provider } = await params;
  const impl = getProvider(provider);
  if (!impl || !impl.handleWebhook)
    return json({ error: "Webhook non supporté pour ce fournisseur." }, 400);

  const result = await impl.handleWebhook(request);
  if (!result?.ok) return json({ error: result?.error || "Webhook invalide." }, 400);
  if (result.completed) await completeTransaction(result.transactionId);
  else if (result.failed) await failTransaction(result.transactionId);
  return json({ ok: true });
});

import { listTransactions } from "@/lib/payments";
import { accountFromRequest } from "@/lib/authServer";
import { json, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

// Historique des recharges du compte connecté (plus récent en tête).
export const GET = handler(async (request) => {
  const account = await accountFromRequest(request);
  if (!account) return json({ error: "Connexion requise." }, 401);
  const transactions = await listTransactions(account.id);
  return json({ transactions });
});

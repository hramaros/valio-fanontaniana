import { listTransactions, countTransactions } from "@/lib/payments";
import { cursorFromRequest, nextCursor } from "@/lib/scopedIndex";
import { accountFromRequest } from "@/lib/authServer";
import { json, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

const PAGE = 50;

// Historique des recharges du compte connecté (plus récent en tête).
// Paginé par curseur : ce sont des écritures comptables, elles ne sont plus
// plafonnées et doivent rester intégralement consultables.
export const GET = handler(async (request) => {
  const account = await accountFromRequest(request);
  if (!account) return json({ error: "Connexion requise." }, 401);

  const transactions = await listTransactions(
    account.id,
    PAGE,
    cursorFromRequest(request.url),
  );
  return json({
    transactions,
    total: await countTransactions(account.id),
    nextCursor: nextCursor(transactions, PAGE, "createdAt"),
  });
});

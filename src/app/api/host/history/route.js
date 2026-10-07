import { listExamRecords, countExamRecords } from "@/lib/history";
import { cursorFromRequest, nextCursor } from "@/lib/scopedIndex";
import { accountFromRequest } from "@/lib/authServer";
import { json, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

const PAGE = 50;

// Historique des examens du formateur connecté (résumés).
//
// Paginé par curseur (`?before=&afterId=`), du plus récent au plus ancien.
// L'historique n'est plus plafonné (cf. src/lib/scopedIndex.js) : un formateur
// de longue date peut en accumuler bien au-delà d'une page, et doit pouvoir
// tous les atteindre.
export const GET = handler(async (request) => {
  const account = await accountFromRequest(request);
  if (!account) return json({ error: "Connexion requise." }, 401);

  const records = await listExamRecords(
    account.id,
    PAGE,
    cursorFromRequest(request.url),
  );
  return json({
    records,
    total: await countExamRecords(account.id),
    nextCursor: nextCursor(records, PAGE, "endedAt"),
  });
});

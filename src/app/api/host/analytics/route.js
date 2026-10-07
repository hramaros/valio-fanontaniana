import { listExamRecords, countExamRecords } from "@/lib/history";
import { aggregateStats } from "@/lib/analytics";
import { accountFromRequest } from "@/lib/authServer";
import { json, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

// Fenêtre d'agrégation. L'historique n'est plus plafonné (cf. history.js),
// mais agréger des années d'examens à chaque affichage de tableau de bord
// coûterait un `MGET` sans borne : on garde une fenêtre, et surtout on le DIT
// au lieu de présenter un total partiel comme un total.
const WINDOW = 200;

// Statistiques cumulées + examens récents du formateur connecté.
export const GET = handler(async (request) => {
  const account = await accountFromRequest(request);
  if (!account) return json({ error: "Connexion requise." }, 401);

  const [records, total] = await Promise.all([
    listExamRecords(account.id, WINDOW),
    countExamRecords(account.id),
  ]);

  return json({
    // `examCount` reste le vrai total : un ZCARD le donne exactement, sans
    // rapatrier les documents. Les autres cumuls portent sur la fenêtre.
    stats: { ...aggregateStats(records), examCount: total },
    window: WINDOW,
    partial: total > records.length,
    recent: records.slice(0, 8),
  });
});

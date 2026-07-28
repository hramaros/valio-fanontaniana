import { adminFromRequest } from "@/lib/authServer";
import { overviewData } from "@/lib/adminData";
import { checkRateLimit } from "@/lib/rateLimit";
import { json, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

// Tour de contrôle : KPI globaux de pilotage. Réservé aux comptes admin.
// La barrière est ICI (403), pas dans le rendu — le rôle exposé au client ne
// sert qu'à afficher ou non l'entrée « Admin ».
export const GET = handler(async (request) => {
  const admin = await adminFromRequest(request);
  if (!admin) return json({ error: "Accès refusé." }, 403);

  // Plafond généreux, appliqué par compte admin (après l'auth : une requête
  // non-admin n'atteint jamais le limiteur).
  if (!(await checkRateLimit("admin", admin.id)))
    return json({ error: "Trop de requêtes, réessayez dans un instant." }, 429);

  const url = new URL(request.url);
  const raw = Number(url.searchParams.get("days"));
  // Borné : ni une fenêtre absurde, ni un rapatriement illimité.
  const days = [7, 30, 90].includes(raw) ? raw : 30;

  return json(await overviewData({ days }));
});

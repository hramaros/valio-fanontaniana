import { switchToLibre } from "@/lib/rooms";
import { json, codeFromParams, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

// Repli gratuit quand le solde bloque le lancement : bascule la salle en mode
// Libre pour que le formateur puisse quand même faire son cours.
export const POST = handler(async (_request, { params }) => {
  const code = await codeFromParams(params);
  const result = await switchToLibre(code);
  if (!result.ok) return json({ error: result.error }, result.status || 400);
  return json({ ok: true });
});

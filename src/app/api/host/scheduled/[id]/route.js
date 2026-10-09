import { getScheduledExam, cancelScheduledExam } from "@/lib/scheduled";
import { accountFromRequest } from "@/lib/authServer";
import { json, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handler(async (request, { params }) => {
  const account = await accountFromRequest(request);
  if (!account) return json({ error: "Connexion requise." }, 401);
  const { id } = await params;
  const scheduled = await getScheduledExam(account.id, id);
  if (!scheduled) return json({ error: "Examen introuvable." }, 404);
  return json({ scheduled });
});

export const DELETE = handler(async (request, { params }) => {
  const account = await accountFromRequest(request);
  if (!account) return json({ error: "Connexion requise." }, 401);
  const { id } = await params;
  const res = await cancelScheduledExam(account.id, id);
  if (!res.ok) return json({ error: res.error }, res.status || 400);
  return json({ ok: true });
});

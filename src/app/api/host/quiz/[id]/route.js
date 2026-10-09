import { getQuiz, updateQuiz, deleteQuiz } from "@/lib/quizzes";
import { accountFromRequest } from "@/lib/authServer";
import { json, readBody, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handler(async (request, { params }) => {
  const account = await accountFromRequest(request);
  if (!account) return json({ error: "Connexion requise." }, 401);
  const { id } = await params;
  const quiz = await getQuiz(account.id, id);
  if (!quiz) return json({ error: "Quiz introuvable." }, 404);
  return json({ quiz });
});

export const PUT = handler(async (request, { params }) => {
  const account = await accountFromRequest(request);
  if (!account) return json({ error: "Connexion requise." }, 401);
  const { id } = await params;
  const body = await readBody(request);
  const res = await updateQuiz(account.id, id, body.quiz || body);
  if (!res.ok) return json({ error: res.error }, res.status || 400);
  return json({ quiz: res.quiz });
});

export const DELETE = handler(async (request, { params }) => {
  const account = await accountFromRequest(request);
  if (!account) return json({ error: "Connexion requise." }, 401);
  const { id } = await params;
  const res = await deleteQuiz(account.id, id);
  if (!res.ok) return json({ error: res.error }, res.status || 400);
  return json({ ok: true });
});

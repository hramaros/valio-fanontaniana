import { duplicateQuiz } from "@/lib/quizzes";
import { accountFromRequest } from "@/lib/authServer";
import { json, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = handler(async (request, { params }) => {
  const account = await accountFromRequest(request);
  if (!account) return json({ error: "Connexion requise." }, 401);
  const { id } = await params;
  const res = await duplicateQuiz(account.id, id);
  if (!res.ok) return json({ error: res.error }, res.status || 400);
  return json({ quiz: res.quiz });
});

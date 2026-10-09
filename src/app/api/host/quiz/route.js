import { listQuizzes, countQuizzes, createQuiz } from "@/lib/quizzes";
import { cursorFromRequest, nextCursor } from "@/lib/scopedIndex";
import { accountFromRequest } from "@/lib/authServer";
import { json, readBody, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

const PAGE = 24;

// Bibliothèque de quiz du formateur connecté.
export const GET = handler(async (request) => {
  const account = await accountFromRequest(request);
  if (!account) return json({ error: "Connexion requise." }, 401);

  const quizzes = await listQuizzes(account.id, PAGE, cursorFromRequest(request.url));
  return json({
    quizzes,
    total: await countQuizzes(account.id),
    nextCursor: nextCursor(quizzes, PAGE, "updatedAt"),
  });
});

export const POST = handler(async (request) => {
  const account = await accountFromRequest(request);
  if (!account) return json({ error: "Connexion requise." }, 401);

  const body = await readBody(request);
  const res = await createQuiz(account.id, body.quiz || body, {
    source: body.source,
    sourceUrl: body.sourceUrl,
  });
  if (!res.ok) return json({ error: res.error }, res.status || 400);
  return json({ quiz: res.quiz });
});

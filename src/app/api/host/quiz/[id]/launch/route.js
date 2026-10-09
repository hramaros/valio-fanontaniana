import { getQuiz, markQuizUsed } from "@/lib/quizzes";
import { createRoom, setQuiz } from "@/lib/rooms";
import { accountFromRequest } from "@/lib/authServer";
import { json, readBody, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

// Lance immédiatement un quiz de la bibliothèque : crée la salle, y pose le
// quiz, rend le code. Fait côté serveur en un appel plutôt qu'orchestré par le
// navigateur — une création de salle suivie d'un `setQuiz` qui échoue
// laisserait une salle vide et un formateur devant sa classe.
export const POST = handler(async (request, { params }) => {
  const account = await accountFromRequest(request);
  if (!account) return json({ error: "Connexion requise." }, 401);

  const { id } = await params;
  const quiz = await getQuiz(account.id, id);
  if (!quiz) return json({ error: "Quiz introuvable." }, 404);

  const { classId, hostName } = await readBody(request);

  const meta = await createRoom(hostName || account.name || "Formateur", account.id);
  const res = await setQuiz(meta.code, {
    title: quiz.title,
    mode: quiz.mode,
    capacity: quiz.capacity,
    totalDurationSec: quiz.totalDurationSec,
    questions: quiz.questions,
    classId: classId || null,
  });
  if (!res.ok) return json({ error: res.error }, 400);

  await markQuizUsed(account.id, id);
  return json({ code: meta.code });
});

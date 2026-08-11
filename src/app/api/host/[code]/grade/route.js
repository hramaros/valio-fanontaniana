import { gradeFreeAnswer } from "@/lib/rooms";
import { json, readBody, codeFromParams, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

// Le formateur note la rédaction d'un participant. `credit` vaut 0 à 1 ;
// `correct` (booléen) reste accepté pour ne pas casser un client plus ancien.
export const POST = handler(async (request, { params }) => {
  const code = await codeFromParams(params);
  const { playerId, questionId, credit, correct } = await readBody(request);
  const value = credit === undefined ? correct : credit;
  const result = await gradeFreeAnswer(code, playerId, questionId, value);
  if (!result.ok) return json({ error: result.error }, result.status || 400);
  return json({
    credit: result.credit,
    correct: result.correct,
    points: result.points,
    score: result.score,
  });
});

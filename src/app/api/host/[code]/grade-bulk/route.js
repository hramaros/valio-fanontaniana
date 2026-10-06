import { gradeFreeAnswersBulk } from "@/lib/rooms";
import { json, readBody, codeFromParams, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

// Corrige plusieurs rédactions en un appel — « tout accorder » / « tout
// refuser » sur une question, sans un aller-retour par élève.
//
// Corps : { grades: [{ playerId, questionId, credit }] }  (credit : 0 à 1)
export const POST = handler(async (request, { params }) => {
  const code = await codeFromParams(params);
  const { grades } = await readBody(request);
  const result = await gradeFreeAnswersBulk(code, grades);
  if (!result.ok) return json({ error: result.error }, result.status || 400);
  return json({ applied: result.applied, skipped: result.skipped });
});

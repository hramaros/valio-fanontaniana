import { importGoogleForm } from "@/lib/gformsImport";
import { checkRateLimit } from "@/lib/rateLimit";
import { accountFromRequest } from "@/lib/authServer";
import { json, readBody, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

// Import d'un Google Form depuis son lien public.
//
// Cette route NE PERSISTE RIEN : elle rend un quiz que le client ouvre dans
// l'éditeur. Un formulaire qui n'est pas configuré en « questionnaire » n'a
// aucune bonne réponse, et `validateQuiz` refuserait de l'enregistrer tel
// quel — c'est au formateur de désigner les bonnes réponses, puis
// d'enregistrer par POST /api/host/quiz.
export const POST = handler(async (request) => {
  const account = await accountFromRequest(request);
  if (!account) return json({ error: "Connexion requise." }, 401);

  // Limité par compte : l'appel provoque une requête sortante vers Google.
  if (!(await checkRateLimit("gformsImport", account.id))) {
    return json(
      { error: "Trop d'imports d'affilée. Patientez quelques minutes." },
      429,
    );
  }

  const { url } = await readBody(request);
  const res = await importGoogleForm(url);
  if (!res.ok) {
    return json({ error: res.error, ignores: res.ignores || [] }, res.status || 400);
  }

  return json({
    quiz: res.quiz,
    ignores: res.ignores,
    corrigeDetecte: res.corrigeDetecte,
    sourceUrl: res.sourceUrl,
  });
});

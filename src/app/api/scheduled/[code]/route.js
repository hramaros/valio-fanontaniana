import { openScheduledIfDue } from "@/lib/scheduled";
import { json, handler, codeFromParams } from "@/lib/http";

export const dynamic = "force-dynamic";

// Route PUBLIQUE : c'est elle que consulte un participant arrivé en avance.
//
// Elle fait aussi AVANCER l'examen (ouverture de la salle, puis départ du
// chrono) quand l'heure est venue — il n'y a pas de tâche de fond, ce sont les
// accès eux-mêmes qui déclenchent les transitions, sous verrou Redis.
//
// Volontairement sans limitation de débit, pour la même raison que
// join/register/answer : une classe entière se présente derrière une seule
// adresse IP d'établissement, et un plafond par IP y casserait l'usage
// légitime. Le verrou protège l'écriture, et un GET ne coûte que des lectures.
export const GET = handler(async (request, { params }) => {
  const code = await codeFromParams(params);
  if (!code) return json({ error: "Code requis." }, 400);
  const res = await openScheduledIfDue(code);
  if (!res.ok) return json({ error: res.error }, res.status || 400);
  return json(res);
});

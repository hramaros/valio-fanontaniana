import {
  scheduleExam,
  listUpcoming,
  listPast,
  countScheduled,
  scheduledAffordability,
  getScheduledExam,
  REGISTRATION_WINDOWS_MIN,
  DEFAULT_REGISTRATION_WINDOW_MIN,
} from "@/lib/scheduled";
import { accountFromRequest } from "@/lib/authServer";
import { json, readBody, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

// Planning du formateur connecté.
//
// `soldeInsuffisant` est le signal important : une salle qui s'ouvre toute
// seule n'a personne pour recharger le compte. On le calcule ici, sur les
// examens à venir, pour pouvoir prévenir AVANT l'échéance.
export const GET = handler(async (request) => {
  const account = await accountFromRequest(request);
  if (!account) return json({ error: "Connexion requise." }, 401);

  const [upcoming, past] = await Promise.all([
    listUpcoming(account.id),
    listPast(account.id, 20),
  ]);

  // Un seul appel suffit : le prix ne dépend que du mode et de la capacité,
  // et le solde est commun. On interroge donc le plus proche examen payant.
  const prochainPayant = upcoming.find((s) => s.mode === "examen");
  let solde = { required: false };
  if (prochainPayant) {
    const doc = await getScheduledExam(account.id, prochainPayant.id);
    if (doc) solde = await scheduledAffordability(account.id, doc);
  }

  return json({
    upcoming,
    past,
    total: await countScheduled(account.id),
    solde,
    windows: REGISTRATION_WINDOWS_MIN,
    defaultWindow: DEFAULT_REGISTRATION_WINDOW_MIN,
  });
});

export const POST = handler(async (request) => {
  const account = await accountFromRequest(request);
  if (!account) return json({ error: "Connexion requise." }, 401);

  const { quizId, classId, startsAt, registrationWindowMin } = await readBody(request);
  const res = await scheduleExam(account.id, {
    quizId,
    classId,
    startsAt,
    registrationWindowMin,
  });
  if (!res.ok) return json({ error: res.error }, res.status || 400);

  const solde = await scheduledAffordability(account.id, res.scheduled);
  return json({ scheduled: res.scheduled, solde });
});

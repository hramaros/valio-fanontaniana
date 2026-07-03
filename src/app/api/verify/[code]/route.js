import { getExamRecordByVerifyCode } from "@/lib/history";
import { getAccountById } from "@/lib/accounts";
import { json, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

// Consultation publique des résultats d'un Examen — sans authentification :
// le code de consultation (VF-XXXX-XXXX) fait office de clé d'accès.
// Le payload est assaini : jamais d'accountId, de prix, ni d'ids joueurs.
export const GET = handler(async (_request, { params }) => {
  const { code } = await params;
  const record = await getExamRecordByVerifyCode(code);
  if (!record) {
    return json({ error: "Aucun examen ne correspond à ce code." }, 404);
  }

  // Les enregistrements antérieurs à la fonctionnalité n'ont pas de hostName :
  // on retombe sur le nom du compte formateur.
  let hostName = record.hostName || null;
  if (!hostName && record.accountId) {
    const account = await getAccountById(record.accountId);
    hostName = account?.name || null;
  }

  const leaderboard = (record.leaderboard || []).map((p) => ({
    rank: p.rank,
    pseudo: p.pseudo,
    note: p.note,
    nbCorrect: p.nbCorrect,
  }));

  return json({
    title: record.title,
    className: record.className || null,
    hostName,
    endedAt: record.endedAt,
    nbQuestions: record.nbQuestions,
    participantCount: record.participantCount,
    avgNote: record.avgNote,
    bestNote: leaderboard.reduce((m, p) => Math.max(m, p.note ?? 0), 0),
    leaderboard,
  });
});

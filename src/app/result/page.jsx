"use client";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Podium from "@/components/Podium";
import Icon from "@/components/Icon";
import { apiGet } from "@/lib/api";
import { normalizeCode } from "@/lib/code";
import { usePolling } from "@/lib/usePolling";
import { getPlayerSession } from "@/lib/session";

// Chargé à la demande (jsPDF est lourd) : on n'alourdit pas le bundle de la page.
async function exportPdf(board, me) {
  const { downloadParticipantPdf } = await import("@/lib/pdf");
  downloadParticipantPdf(board, me);
}

function ResultInner() {
  const params = useSearchParams();
  const code = normalizeCode(params.get("code") || "");
  const session = typeof window !== "undefined" ? getPlayerSession() : null;
  const playerId = session?.code === code ? session.playerId : null;

  const fetcher = useMemo(
    () => async () => (await apiGet(`/api/room/${code}/results`)).data,
    [code],
  );
  const board = usePolling(fetcher, 1500, true);

  const ended = board?.status === "ended";
  const me = board?.leaderboard?.find((p) => p.id === playerId) || null;

  if (!board) {
    return <div className="center-screen"><div className="spin" role="status" aria-label="Chargement" /></div>;
  }

  if (!ended) {
    const reviewing = board.status === "review";
    return (
      <div className="center-screen">
        <div className="container container--narrow stack gap-16" style={{ textAlign: "center" }}>
          <div className="spin" role="status" aria-label="Chargement" style={{ margin: "0 auto" }} />
          <h1 style={{ fontSize: "2rem" }}>
            {reviewing ? "Correction en cours…" : "Encore un instant…"}
          </h1>
          <p className="muted">
            {reviewing
              ? "Le formateur valide les réponses libres. Le classement s'affiche dès qu'il a finalisé la session."
              : "En attente de la fin du chrono pour dévoiler le classement."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container container--narrow stack gap-24">
      <div className="stack gap-8" style={{ textAlign: "center" }}>
        <span className="eyebrow">Salle {code} · terminé</span>
        <h1 style={{ fontSize: "2.4rem" }}>Résultats</h1>
      </div>

      {me ? (
        <div className="card stack gap-16">
          <div style={{ textAlign: "center" }}>
            <div className="eyebrow">{me.pseudo}</div>
            <div style={{ fontSize: "1.1rem", marginTop: 4 }}>
              {me.rank === 1
                ? "🏆 Vous remportez le quiz !"
                : `Vous finissez ${me.rank}ᵉ sur ${board.leaderboard.length}`}
            </div>
          </div>
          <div className="stat-grid">
            <div className="stat">
              <div className="stat__num">{me.score}</div>
              <div className="stat__label">Points</div>
            </div>
            <div className="stat">
              <div className="stat__num">{me.note}</div>
              <div className="stat__label">Note / 20</div>
            </div>
            <div className="stat">
              <div className="stat__num">#{me.rank}</div>
              <div className="stat__label">Classement</div>
            </div>
          </div>
          <p className="tiny muted" style={{ textAlign: "center" }}>
            {me.nbCorrect} / {board.nbQuestions} bonne
            {me.nbCorrect > 1 ? "s" : ""} réponse{me.nbCorrect > 1 ? "s" : ""}
          </p>
        </div>
      ) : (
        <div className="card" style={{ textAlign: "center" }}>
          <p className="muted">Aucun résultat trouvé pour votre session.</p>
        </div>
      )}

      <div className="stack gap-12">
        <span className="eyebrow">Podium</span>
        <Podium podium={board.podium} />
      </div>

      {me && (
        <button
          className="btn btn--primary btn--lg btn--block"
          onClick={() => exportPdf(board, me)}
        >
          <Icon name="download" /> Télécharger mon résultat (PDF)
        </button>
      )}

      <Link href="/" className="btn btn--ghost btn--block">
        Retour à l'accueil
      </Link>
    </div>
  );
}

export default function ResultPage() {
  return (
    <Suspense fallback={<div className="center-screen"><div className="spin" role="status" aria-label="Chargement" /></div>}>
      <ResultInner />
    </Suspense>
  );
}

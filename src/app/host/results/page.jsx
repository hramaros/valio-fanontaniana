"use client";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Countdown from "@/components/Countdown";
import Leaderboard from "@/components/Leaderboard";
import Podium from "@/components/Podium";
import ReviewGrader from "@/components/ReviewGrader";
import ConfirmButton from "@/components/ConfirmButton";
import CopyButton from "@/components/CopyButton";
import Icon from "@/components/Icon";
import { apiGet, apiPost } from "@/lib/api";
import { normalizeCode } from "@/lib/code";
import { usePolling } from "@/lib/usePolling";
import { useAccount } from "@/lib/account-client";
import { canAfford } from "@/lib/wallet";
import { PRICE_SMALL_AR } from "@/lib/exam";

// Chargé à la demande (jsPDF est lourd) : on n'alourdit pas le bundle de la page.
async function exportPdf(board) {
  const { downloadHostResultsPdf } = await import("@/lib/pdf");
  downloadHostResultsPdf(board);
}

function HostResultsInner() {
  const params = useSearchParams();
  const code = normalizeCode(params.get("code") || "");
  const { account } = useAccount();

  // Les fetchers ne renvoient que des données valides : un payload d'erreur
  // (salle expirée, Redis indisponible…) ne doit jamais entrer dans l'état.
  const stateFetcher = useMemo(
    () => async () => {
      const { ok, status, data } = await apiGet(`/api/room/${code}/state`);
      if (ok) return data;
      return status === 404 ? { notFound: true } : undefined;
    },
    [code],
  );
  const resultsFetcher = useMemo(
    () => async () => {
      const { ok, data } = await apiGet(`/api/room/${code}/results`);
      return ok ? data : undefined;
    },
    [code],
  );
  const reviewFetcher = useMemo(
    () => async () => {
      const { ok, data } = await apiGet(`/api/host/${code}/review`);
      return ok ? data : undefined;
    },
    [code],
  );

  const state = usePolling(stateFetcher, 1200, true);
  const status = state?.status;
  const review = status === "review";
  const ended = status === "ended";

  const board = usePolling(resultsFetcher, 1500, true);
  const reviewData = usePolling(reviewFetcher, 1000, review);

  // Aperçu local instantané pendant que le polling rattrape le serveur.
  const [overlay, setOverlay] = useState({});
  const [finalizing, setFinalizing] = useState(false);

  async function grade(questionId, playerId, correct) {
    setOverlay((o) => ({ ...o, [`${questionId}:${playerId}`]: correct }));
    await apiPost(`/api/host/${code}/grade`, { questionId, playerId, correct });
  }

  async function finalize() {
    setFinalizing(true);
    await apiPost(`/api/host/${code}/finalize`);
    setFinalizing(false);
  }

  async function endExam() {
    await apiPost(`/api/host/${code}/end`, {});
  }

  const mergedReview = useMemo(() => {
    if (!reviewData) return null;
    return {
      ...reviewData,
      questions: reviewData.questions.map((q) => ({
        ...q,
        submissions: q.submissions.map((s) => {
          const k = `${q.id}:${s.playerId}`;
          return k in overlay ? { ...s, correct: overlay[k] } : s;
        }),
      })),
    };
  }, [reviewData, overlay]);

  const pending = mergedReview
    ? mergedReview.questions.reduce(
        (n, q) => n + q.submissions.filter((s) => s.correct === null).length,
        0,
      )
    : 0;

  if (!state) {
    return <div className="center-work"><div className="spin" role="status" aria-label="Chargement" /></div>;
  }

  if (state.notFound) {
    return (
      <div className="center-work">
        <div className="card stack gap-16" style={{ textAlign: "center", maxWidth: 440 }}>
          <h2>Session introuvable</h2>
          <p className="muted">
            Cette salle n'existe plus ou a expiré. Retrouvez vos sessions
            passées dans « Mes examens ».
          </p>
          <Link href="/host" className="btn btn--primary">Créer un quiz</Link>
          <Link href="/host/history" className="btn btn--ghost">Mes examens</Link>
        </div>
      </div>
    );
  }

  const offset = state.serverNow - Date.now();
  const endsAt = state.startedAt + state.durationMs;

  const header = (
    <div className="row row--between wrap gap-12">
      <span className="eyebrow">Session en direct</span>
      <div className="panel row gap-12" style={{ padding: "10px 16px" }}>
        <span className="tiny muted">Code</span>
        <span className="code-chip">{code}</span>
      </div>
    </div>
  );

  // — Phase de correction : le formateur valide les réponses libres —
  if (review) {
    return (
      <div className="stack gap-24">
        {header}
        <div className="card stack gap-8" style={{ textAlign: "center" }}>
          <span className="eyebrow">Chrono terminé</span>
          <h1 style={{ fontSize: "1.9rem" }}>Validez les réponses libres</h1>
          <p className="hint" style={{ justifyContent: "center" }}>
            <Icon name="penLine" size={15} />
            Validez chaque réponse, puis finalisez pour publier notes et
            classement.
          </p>
        </div>

        {mergedReview ? (
          <ReviewGrader review={mergedReview} onGrade={grade} />
        ) : (
          <div className="panel" style={{ textAlign: "center" }}>
            <div className="spin" role="status" aria-label="Chargement" style={{ margin: "0 auto" }} />
          </div>
        )}

        <div className="stack gap-8">
          <ConfirmButton
            className="btn btn--primary btn--lg btn--block"
            confirmLabel="Publier définitivement ?"
            disabled={finalizing}
            onConfirm={finalize}
          >
            {finalizing ? "Finalisation…" : "Finaliser et publier le classement"}
          </ConfirmButton>
          <div className="row" style={{ justifyContent: "center" }}>
            {pending > 0 ? (
              <span className="pill pill--warn">
                <Icon name="alertTriangle" size={14} />
                {pending} réponse{pending > 1 ? "s" : ""} non validée
                {pending > 1 ? "s" : ""} — comptée{pending > 1 ? "s" : ""} fausse
                {pending > 1 ? "s" : ""} à la finalisation
              </span>
            ) : (
              <span className="pill pill--ok">
                <Icon name="check" size={14} /> Toutes les réponses sont validées
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // — Phase en cours / terminée : classement (comportement existant) —
  if (!board) {
    return <div className="center-work"><div className="spin" role="status" aria-label="Chargement" /></div>;
  }

  return (
    <div className="stack gap-24">
      {header}

      {ended ? (
        <div className="stack gap-8" style={{ textAlign: "center" }}>
          <span className="eyebrow">Quiz terminé</span>
          <h1 style={{ fontSize: "2.4rem" }}>Classement final</h1>
        </div>
      ) : (
        <div className="card session-live">
          <div className="stack gap-8">
            <span className="eyebrow">Quiz en cours</span>
            <h1 style={{ fontSize: "1.8rem" }}>
              {board.leaderboard.length} participant
              {board.leaderboard.length > 1 ? "s" : ""} en jeu
            </h1>
            <p className="muted tiny">Le classement se fige à la fin du chrono.</p>
          </div>
          <div className="stack gap-8 session-live__actions">
            <Countdown
              endsAt={endsAt}
              durationMs={state.durationMs}
              serverOffset={offset}
            />
            <ConfirmButton
              className="btn btn--danger"
              confirmLabel="Clôturer pour tous les participants ?"
              confirmYesLabel="Oui, terminer"
              confirmNoLabel="Non"
              split
              onConfirm={endExam}
            >
              Terminer l'examen
            </ConfirmButton>
          </div>
        </div>
      )}

      {ended && <Podium podium={board.podium} />}

      <div className="stack gap-12">
        <span className="eyebrow">
          {ended ? "Tous les participants" : "Classement en direct"}
        </span>
        <Leaderboard players={board.leaderboard} />
      </div>

      {ended && board.verifyCode && (
        <div className="card stack gap-12" style={{ textAlign: "center", alignItems: "center" }}>
          <span className="icon-badge" aria-hidden="true">
            <Icon name="shieldCheck" size={19} />
          </span>
          <span className="tiny muted">Consultation publique des résultats</span>
          <div className="code-chip" style={{ fontSize: "1.2rem" }}>
            {board.verifyCode}
          </div>
          <p className="hint" style={{ justifyContent: "center" }}>
            <Icon name="info" size={14} />
            Ce code ouvre la fiche officielle de l&apos;examen — partageable
            avec parents et établissements.
          </p>
          <div className="row gap-12 wrap" style={{ justifyContent: "center" }}>
            <CopyButton value={board.verifyCode} label="Copier le code" />
            <CopyButton
              value={`${typeof window !== "undefined" ? window.location.origin : ""}/verifier?code=${board.verifyCode}`}
              label="Copier le lien"
              icon="link"
            />
          </div>
        </div>
      )}

      {ended && state.mode === "examen" && (
        <div className="panel" style={{ textAlign: "center" }}>
          <span className="tiny muted">Coût de cet examen</span>
          <div className="money" style={{ fontSize: "1.4rem", fontWeight: 800 }}>
            {board.priceAr} Ar
          </div>
          <span className="tiny muted">
            Débité parce que l&apos;examen est allé au bout — une session
            interrompue n&apos;est jamais facturée.
          </span>
        </div>
      )}

      {ended && (
        <div className="stack gap-12">
          <button
            className="btn btn--primary btn--lg btn--block"
            onClick={() => exportPdf(board)}
          >
            <Icon name="download" /> Télécharger le classement (PDF)
          </button>
          <Link href="/host" className="btn btn--ghost btn--block">
            <Icon name="plus" size={16} /> Créer un nouveau quiz
          </Link>

          {/* Le bon moment pour parler d'argent : les notes sont obtenues, le
              cours est fini, personne n'attend. Jamais dans le lobby. */}
          {account && !canAfford(account.balanceAr, PRICE_SMALL_AR) && (
            <div className="panel stack gap-8" style={{ textAlign: "center" }}>
              <span className="tiny muted">
                Votre solde ne couvre plus un examen
                {" "}(<span className="money">{account.balanceAr} Ar</span>).
              </span>
              <Link href="/host/wallet" className="btn btn--ghost btn--compact">
                <Icon name="creditCard" size={15} /> Recharger avant le prochain
                cours
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function HostResultsPage() {
  return (
    <Suspense fallback={<div className="center-work"><div className="spin" role="status" aria-label="Chargement" /></div>}>
      <HostResultsInner />
    </Suspense>
  );
}

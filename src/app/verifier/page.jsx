"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Brand from "@/components/Brand";
import Icon from "@/components/Icon";
import { apiGet } from "@/lib/api";
import { normalizeVerifyCode } from "@/lib/code";

function frDate(ts) {
  return ts
    ? new Date(ts).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })
    : "";
}

// Consultation publique des résultats d'un Examen : registre sobre
// (« la note est sérieuse ») — pas de podium ni de points de jeu,
// uniquement la note /20 et les bonnes réponses.
function VerifierInner() {
  const params = useSearchParams();
  const initial = params.get("code") || "";
  const [code, setCode] = useState(initial);
  const [exam, setExam] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const lookup = useCallback(async (raw) => {
    const clean = normalizeVerifyCode(raw);
    if (!clean) {
      setError("Le code doit ressembler à VF-XXXX-XXXX.");
      return;
    }
    setError("");
    setLoading(true);
    const { ok, data } = await apiGet(`/api/verify/${clean}`);
    setLoading(false);
    if (!ok) {
      setError(data?.error || "Consultation impossible. Réessayez.");
      return;
    }
    setExam(data);
  }, []);

  // Deep-link : /verifier?code=VF-… lance la consultation directement.
  useEffect(() => {
    if (initial) lookup(initial);
  }, [initial, lookup]);

  function submit(e) {
    e.preventDefault();
    lookup(code);
  }

  if (exam) {
    return (
      <div className="container container--narrow stack gap-24">
        <div className="row row--between wrap gap-12">
          <Brand />
          <span className="shell-tag">Consultation publique</span>
        </div>

        <div className="card stack gap-16">
          <div className="stack gap-8">
            <span className="eyebrow">Examen vérifié · valio.fanontaniana</span>
            <h1 style={{ fontSize: "1.8rem" }}>{exam.title}</h1>
            <p className="muted" style={{ margin: 0 }}>
              {exam.className ? `Classe ${exam.className} · ` : ""}
              {exam.hostName ? `Formateur : ${exam.hostName} · ` : ""}
              {frDate(exam.endedAt)}
            </p>
          </div>

          <div
            className="stat-grid"
            style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
          >
            <div className="stat">
              <div className="stat__num">{exam.participantCount}</div>
              <div className="stat__label">
                Participant{exam.participantCount > 1 ? "s" : ""}
              </div>
            </div>
            <div className="stat">
              <div className="stat__num">{exam.nbQuestions}</div>
              <div className="stat__label">Questions</div>
            </div>
            <div className="stat">
              <div className="stat__num">{exam.avgNote}</div>
              <div className="stat__label">Moyenne / 20</div>
            </div>
            <div className="stat">
              <div className="stat__num">{exam.bestNote}</div>
              <div className="stat__label">Meilleure note / 20</div>
            </div>
          </div>
        </div>

        <div className="stack gap-12">
          <span className="eyebrow">Classement complet</span>
          {exam.leaderboard.length === 0 ? (
            <div className="panel" style={{ textAlign: "center" }}>
              <p className="muted">Aucun participant à cet examen.</p>
            </div>
          ) : (
            <div className="lb">
              {exam.leaderboard.map((p, i) => (
                <div key={i} className="lb-row">
                  <div className="lb-rank">{p.rank}</div>
                  <div>
                    <div style={{ fontWeight: 700 }}>{p.pseudo}</div>
                    <div className="lb-note">
                      {p.nbCorrect} bonne{p.nbCorrect > 1 ? "s" : ""} réponse
                      {p.nbCorrect > 1 ? "s" : ""} sur {exam.nbQuestions}
                    </div>
                  </div>
                  <div className="lb-score">{p.note}/20</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="tiny muted" style={{ textAlign: "center" }}>
          Résultats enregistrés par valio.fanontaniana à la clôture de
          l'examen — ils ne peuvent plus être modifiés.
        </p>

        <button
          type="button"
          className="btn btn--ghost btn--block"
          onClick={() => {
            setExam(null);
            setCode("");
          }}
        >
          Consulter un autre examen
        </button>
      </div>
    );
  }

  return (
    <div className="center-screen">
      <div className="container container--narrow stack gap-24">
        <div className="row row--between">
          <Brand />
        </div>

        <div className="stack gap-8">
          <span className="eyebrow">Consultation publique</span>
          <h1 style={{ fontSize: "2rem" }}>Vérifier les résultats d'un examen</h1>
          <p className="muted">
            Saisissez le code de consultation communiqué par le formateur pour
            voir la fiche officielle de l'examen : participants, notes /20 et
            classement.
          </p>
        </div>

        <form className="card stack gap-16" onSubmit={submit}>
          <div>
            <label className="label" htmlFor="verify-code">
              Code de consultation
            </label>
            <input
              id="verify-code"
              className="input input--code input--code--long"
              placeholder="VF-XXXX-XXXX"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={14}
              autoComplete="off"
              autoFocus
            />
          </div>
          {error && <div className="error" role="alert">{error}</div>}
          <button
            type="submit"
            className="btn btn--primary btn--lg btn--block"
            disabled={loading}
          >
            {loading ? (
              "Consultation…"
            ) : (
              <>
                Consulter <Icon name="arrowRight" size={18} />
              </>
            )}
          </button>
        </form>

        <p className="tiny muted" style={{ textAlign: "center" }}>
          Ce code est fourni par le formateur (parents, établissements,
          cabinets de formation). <Link href="/">Retour à l'accueil</Link>
        </p>
      </div>
    </div>
  );
}

export default function VerifierPage() {
  return (
    <Suspense
      fallback={
        <div className="center-screen">
          <div className="spin" role="status" aria-label="Chargement" />
        </div>
      }
    >
      <VerifierInner />
    </Suspense>
  );
}

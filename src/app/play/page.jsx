"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AnswerTile from "@/components/AnswerTile";
import Countdown from "@/components/Countdown";
import Icon from "@/components/Icon";
import { apiGet, apiPost } from "@/lib/api";
import { normalizeCode } from "@/lib/code";
import { getPlayerSession } from "@/lib/session";
import { usePolling } from "@/lib/usePolling";

// Types répondus au clavier plutôt que par tuiles.
const TEXT_TYPES = ["free", "short", "number"];

const TYPE_META = {
  single: { icon: "circleDot", label: "Une seule réponse" },
  multiple: { icon: "listChecks", label: "Plusieurs réponses" },
  short: { icon: "penLine", label: "Réponse courte" },
  number: { icon: "hash", label: "Réponse chiffrée" },
  free: { icon: "bookOpen", label: "Réponse rédigée" },
};

function PlayInner() {
  const router = useRouter();
  const params = useSearchParams();
  const code = normalizeCode(params.get("code") || "");

  const [playerId, setPlayerId] = useState(null);
  const [quiz, setQuiz] = useState(null); // { questions, startedAt, durationMs }
  const [offset, setOffset] = useState(0);
  const [phase, setPhase] = useState("loading"); // loading | playing | done | error
  const [errorMsg, setErrorMsg] = useState("");
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState([]);
  const [freeText, setFreeText] = useState("");
  const [feedback, setFeedback] = useState(null); // { correct, points } | { pending }
  const [submitting, setSubmitting] = useState(false);
  const revealedRef = useRef(new Set());

  // 1) Récupère identité + questions (une seule fois).
  useEffect(() => {
    const s = getPlayerSession();
    if (!s || s.code !== code) {
      router.replace(`/join?code=${code}`);
      return;
    }
    setPlayerId(s.playerId);
    (async () => {
      const { ok, status, data } = await apiGet(`/api/room/${code}/questions`);
      if (!ok) {
        if (status === 409) router.replace(`/result?code=${code}`);
        else {
          setErrorMsg(data?.error || "Impossible de charger le quiz.");
          setPhase("error");
        }
        return;
      }
      setQuiz(data);
      setOffset(data.serverNow - Date.now());
      setPhase("playing");
    })();
  }, [code, router]);

  const question = quiz?.questions?.[qIndex] || null;
  const endsAt = quiz ? quiz.startedAt + quiz.durationMs : 0;

  // 2) Horodatage serveur de l'affichage de chaque question (barème rapidité).
  useEffect(() => {
    if (phase !== "playing" || !question || !playerId) return;
    if (revealedRef.current.has(question.id)) return;
    revealedRef.current.add(question.id);
    apiPost(`/api/room/${code}/reveal`, { playerId, questionId: question.id });
  }, [phase, question, playerId, code]);

  const goToResult = useCallback(() => {
    router.replace(`/result?code=${code}`);
  }, [router, code]);

  // Le formateur peut clôturer manuellement avant la fin du chrono affiché
  // localement (bouton « Terminer ») : on surveille le statut de la salle
  // pour basculer vers les résultats dès que ce n'est plus "running", sans
  // attendre que le chrono local (calculé une fois au chargement) expire.
  const stateFetcher = useMemo(
    () => async () => (await apiGet(`/api/room/${code}/state`)).data,
    [code],
  );
  const state = usePolling(stateFetcher, 1200, phase === "playing" || phase === "done");
  useEffect(() => {
    if (state && state.status !== "running") goToResult();
  }, [state, goToResult]);

  function toggle(answerId) {
    if (!question || feedback) return;
    if (question.type === "single") {
      submitAnswer([answerId]);
    } else {
      setSelected((prev) =>
        prev.includes(answerId)
          ? prev.filter((id) => id !== answerId)
          : [...prev, answerId],
      );
    }
  }

  async function submitAnswer(answerIds) {
    if (submitting) return;
    setSubmitting(true);
    const { ok, status, data } = await apiPost(`/api/room/${code}/answer`, {
      playerId,
      questionId: question.id,
      answerIds,
    });
    setSubmitting(false);
    if (!ok) {
      if (status === 409 && /écoulé|ecoule/i.test(data?.error || "")) {
        goToResult();
        return;
      }
      // déjà répondue / autre : on avance simplement.
      advance();
      return;
    }
    setFeedback({ correct: data.correct, points: data.points });
    setTimeout(advance, 1300);
  }

  // Sert les trois types à saisie clavier. « Rédaction » revient en attente de
  // correction ; « réponse courte » et « numérique » sont corrigés dans la
  // foulée et renvoient donc un vrai retour immédiat, comme les tuiles.
  async function submitText() {
    if (submitting || !question) return;
    const text = freeText.trim();
    if (!text) return;
    setSubmitting(true);
    const { ok, status, data } = await apiPost(`/api/room/${code}/answer`, {
      playerId,
      questionId: question.id,
      text,
    });
    setSubmitting(false);
    if (!ok) {
      if (status === 409 && /écoulé|ecoule/i.test(data?.error || "")) {
        goToResult();
        return;
      }
      advance();
      return;
    }
    setFeedback(
      data?.pending
        ? { pending: true }
        : { correct: data.correct, points: data.points },
    );
    setTimeout(advance, 1300);
  }

  function advance() {
    setFeedback(null);
    setSelected([]);
    setFreeText("");
    setQIndex((i) => {
      const next = i + 1;
      if (next >= (quiz?.questions.length || 0)) {
        setPhase("done");
        return i;
      }
      return next;
    });
  }

  if (phase === "loading") {
    return <div className="center-screen"><div className="spin" role="status" aria-label="Chargement" /></div>;
  }
  if (phase === "error") {
    return (
      <div className="center-screen">
        <div className="card stack gap-16" style={{ textAlign: "center" }}>
          <h2>Oups</h2>
          <p className="muted">{errorMsg}</p>
          <Link href="/" className="btn btn--primary">Accueil</Link>
        </div>
      </div>
    );
  }

  const total = quiz.questions.length;

  return (
    <div className="container stack gap-24">
      <div className="stack gap-12">
        <div className="row row--between wrap gap-12">
          <span className="pill">
            Question {Math.min(qIndex + 1, total)} / {total}
          </span>
          <Countdown
            endsAt={endsAt}
            durationMs={quiz.durationMs}
            serverOffset={offset}
            onExpire={goToResult}
          />
        </div>
        <div className="qtrack" aria-hidden="true">
          <div
            className="qtrack__fill"
            style={{
              transform: `scaleX(${phase === "done" ? 1 : qIndex / total})`,
            }}
          />
        </div>
      </div>

      {phase === "done" ? (
        <div className="card stack gap-16" style={{ textAlign: "center", alignItems: "center" }}>
          <span className="empty-state__icon" aria-hidden="true">
            <Icon name="sparkles" size={26} />
          </span>
          <h1 style={{ fontSize: "2rem" }}>Quiz terminé !</h1>
          <p className="muted" style={{ margin: 0 }}>
            Classement à la fin du chrono.
          </p>
          <div style={{ display: "grid", placeItems: "center" }}>
            <Countdown
              endsAt={endsAt}
              durationMs={quiz.durationMs}
              serverOffset={offset}
              onExpire={goToResult}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            <h1 style={{ fontSize: "1.8rem" }}>{question.text}</h1>
            <span className="pill" style={{ marginTop: 12 }}>
              <Icon name={TYPE_META[question.type]?.icon || "circleDot"} size={14} />
              {TYPE_META[question.type]?.label || "Une seule réponse"}
            </span>
          </div>

          {TEXT_TYPES.includes(question.type) ? (
            !feedback && (
              <div className="stack gap-12">
                {question.type === "free" ? (
                  <textarea
                    className="input input--area"
                    aria-label="Votre réponse"
                    placeholder="Saisissez votre réponse…"
                    value={freeText}
                    onChange={(e) => setFreeText(e.target.value)}
                    maxLength={500}
                    disabled={submitting}
                    autoFocus
                  />
                ) : (
                  // Champ d'une ligne : sur un clavier de téléphone, une zone de
                  // texte pour un mot ou un nombre n'apporte rien et masque
                  // l'écran. `inputMode` fait surgir le bon clavier.
                  <div className="row gap-8">
                    <input
                      className="input"
                      aria-label="Votre réponse"
                      placeholder={
                        question.type === "number" ? "ex. 12" : "Votre réponse…"
                      }
                      inputMode={question.type === "number" ? "decimal" : "text"}
                      value={freeText}
                      onChange={(e) => setFreeText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submitText()}
                      maxLength={240}
                      disabled={submitting}
                      autoFocus
                    />
                    {question.type === "number" && question.unit && (
                      <span className="pill" aria-hidden="true">{question.unit}</span>
                    )}
                  </div>
                )}
                <button
                  className="btn btn--primary btn--lg btn--block"
                  disabled={!freeText.trim() || submitting}
                  onClick={submitText}
                >
                  Valider ma réponse
                </button>
              </div>
            )
          ) : (
            <>
              <div className="answers">
                {question.answers.map((a) => (
                  <AnswerTile
                    key={a.id}
                    answer={a}
                    selected={selected.includes(a.id)}
                    dim={!!feedback}
                    disabled={!!feedback || submitting}
                    onClick={() => toggle(a.id)}
                  />
                ))}
              </div>

              {question.type === "multiple" && !feedback && (
                <button
                  className="btn btn--primary btn--lg btn--block"
                  disabled={selected.length === 0 || submitting}
                  onClick={() => submitAnswer(selected)}
                >
                  Valider ma réponse
                </button>
              )}
            </>
          )}

          {feedback &&
            (feedback.pending ? (
              <div className="card card--wait" style={{ textAlign: "center" }}>
                <h2 className="row" style={{ justifyContent: "center", gap: 9 }}>
                  <Icon name="timer" size={22} /> Réponse envoyée
                </h2>
                <p className="muted">Validée par le formateur après le chrono.</p>
              </div>
            ) : (
              <div
                className={`card ${feedback.correct ? "card--ok" : "card--ko"}`}
                style={{ textAlign: "center" }}
              >
                <h2 className="row" style={{ justifyContent: "center", gap: 9 }}>
                  <Icon name={feedback.correct ? "check" : "close"} size={22} />
                  {feedback.correct ? "Bonne réponse !" : "Raté…"}
                </h2>
                <p className="muted">+{feedback.points} points</p>
              </div>
            ))}
        </>
      )}
    </div>
  );
}

export default function PlayPage() {
  return (
    <Suspense fallback={<div className="center-screen"><div className="spin" role="status" aria-label="Chargement" /></div>}>
      <PlayInner />
    </Suspense>
  );
}

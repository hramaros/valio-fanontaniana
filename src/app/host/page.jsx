"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import QuestionBuilder from "@/components/QuestionBuilder";
import { apiGet, apiPost } from "@/lib/api";
import { generateId } from "@/lib/code";
import { DEFAULT_COLORS } from "@/lib/shapes";
import { saveHostSession } from "@/lib/session";
import { useAccount } from "@/lib/account-client";
import AuthModal from "@/components/AuthModal";
import Icon from "@/components/Icon";
import { TOUR_START_EVENT } from "@/lib/onboarding";
import { examPriceAr } from "@/lib/exam";
import { canAfford } from "@/lib/wallet";

// Chargé à la demande et jamais rendu côté serveur (localStorage/document lus
// au montage) : driver.js et son CSS restent hors du bundle des participants.
const HostTour = dynamic(() => import("@/components/HostTour"), { ssr: false });

function newQuestion() {
  return {
    id: generateId("q"),
    text: "",
    type: "single",
    basePoints: 1000,
    answers: [0, 1].map((i) => ({
      id: generateId("a"),
      text: "",
      color: DEFAULT_COLORS[i],
      correct: false,
    })),
  };
}

export default function HostPage() {
  const router = useRouter();
  const [step, setStep] = useState("identity"); // identity | build
  const [hostName, setHostName] = useState("");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(120);
  const [mode, setMode] = useState("libre");
  const [capacity, setCapacity] = useState("small");
  const [classId, setClassId] = useState("");
  const [classes, setClasses] = useState([]);
  const [code, setCode] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { account, setAccount } = useAccount();
  const [showAuth, setShowAuth] = useState(false);
  const [authError, setAuthError] = useState("");

  // Affiche l'échec d'une connexion Google (retour du callback OAuth),
  // puis nettoie l'URL. Lu via window.location pour éviter le Suspense
  // qu'exigerait useSearchParams.
  useEffect(() => {
    try {
      const err = new URLSearchParams(window.location.search).get("authError");
      if (!err) return;
      setAuthError(
        err === "google_config"
          ? "La connexion Google n'est pas configurée sur ce serveur. Utilisez email + mot de passe."
          : "La connexion Google a échoué. Réessayez, ou utilisez email + mot de passe.",
      );
      window.history.replaceState({}, "", window.location.pathname);
    } catch {}
  }, []);

  // Le mode Examen exige un compte : sinon on ouvre la modale de connexion.
  function chooseExamen() {
    if (account) setMode("examen");
    else setShowAuth(true);
  }

  // Charge les classes du formateur connecté (pour l'examen nominatif).
  useEffect(() => {
    if (!account) return;
    apiGet("/api/host/classes").then(({ ok, data }) => {
      if (ok) setClasses(data.classes);
    });
  }, [account]);

  async function createRoom(e) {
    e.preventDefault();
    if (!hostName.trim()) {
      setError("Entrez votre nom de formateur.");
      return;
    }
    setError("");
    setBusy(true);
    const { ok, data } = await apiPost("/api/host/create", {
      hostName: hostName.trim(),
    });
    setBusy(false);
    if (!ok) {
      setError(data?.error || "Création impossible.");
      return;
    }
    setCode(data.code);
    saveHostSession({ code: data.code, hostName: data.hostName });
    setQuestions([newQuestion()]);
    setStep("build");
  }

  function updateQuestion(i, q) {
    setQuestions((prev) => prev.map((item, idx) => (idx === i ? q : item)));
  }
  function removeQuestion(i) {
    setQuestions((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addQuestion() {
    setQuestions((prev) => [...prev, newQuestion()]);
  }

  async function saveAndLaunch() {
    setError("");
    setBusy(true);
    const quiz = {
      title: title.trim() || "Quiz",
      mode,
      capacity,
      classId: classId || null,
      totalDurationSec: Number(duration),
      questions,
    };
    const { ok, data } = await apiPost(`/api/host/${code}/quiz`, { quiz });
    setBusy(false);
    if (!ok) {
      setError(data?.error || "Quiz invalide.");
      return;
    }
    router.push(`/host/lobby?code=${code}`);
  }

  // Prix de l'examen tel qu'il est configuré à l'écran : sert au pré-contrôle
  // de solde, pour que le formateur sache AVANT le cours s'il pourra lancer.
  const plannedPriceAr = examPriceAr(mode, capacity);

  const showAside = account && account.balanceAr === 0;

  if (step === "identity") {
    return (
      <div className="stack gap-24">
        <HostTour />
        <div className="stack gap-8">
          <span className="eyebrow">Nouveau quiz</span>
          <h1 style={{ fontSize: "2rem" }}>Configurer un quiz</h1>
        </div>
        {authError && (
          <div className="error" role="alert">
            {authError}
          </div>
        )}
        <div
          className={showAside ? "work-grid" : undefined}
          style={showAside ? undefined : { maxWidth: 760 }}
        >
          <form className="card stack gap-16" onSubmit={createRoom}>
            <div data-tour="host-name">
              <label className="label" htmlFor="host">Votre nom</label>
              <input
                id="host"
                className="input"
                placeholder="ex. M. Rakoto"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                maxLength={40}
                autoFocus
              />
            </div>
            <div data-tour="title">
              <label className="label" htmlFor="title">Titre du quiz</label>
              <input
                id="title"
                className="input"
                placeholder="ex. Révision chapitre 3"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
            </div>
            <div
              style={{
                borderTop: "1px solid var(--line)",
                paddingTop: 14,
                marginTop: 2,
                fontWeight: 700,
                fontSize: "0.85rem",
                color: "var(--muted)",
              }}
            >
              Configuration de la session
            </div>
            <div data-tour="duration">
              <label className="label" htmlFor="dur">
                Temps total du quiz (secondes)
              </label>
              <div className="stack gap-8">
                <div className="chips" role="group" aria-label="Durées proposées">
                  {[60, 120, 300].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`chip${Number(duration) === s ? " chip--on" : ""}`}
                      onClick={() => setDuration(s)}
                    >
                      <Icon name="timer" size={14} />
                      {s < 60 ? `${s} s` : `${s / 60} min`}
                    </button>
                  ))}
                </div>
                <input
                  id="dur"
                  type="number"
                  className="input"
                  min={10}
                  step={10}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
              <p className="hint" style={{ marginTop: 8 }}>
                <Icon name="timer" size={14} />
                Un seul chrono pour tout le quiz — chacun répond à son rythme.
              </p>
            </div>
            <div>
              <label className="label">Mode</label>
              <div
                className="choice-cards"
                role="group"
                aria-label="Mode du quiz"
                data-tour="mode"
              >
                <button
                  type="button"
                  className={`choice-card${mode === "libre" ? " choice-card--on" : ""}`}
                  aria-pressed={mode === "libre"}
                  onClick={() => setMode("libre")}
                  data-tour="mode-libre"
                >
                  <span className="choice-card__icon" aria-hidden="true">
                    <Icon name="zap" size={19} />
                  </span>
                  <span className="choice-card__title">Libre</span>
                  <span className="choice-card__desc">
                    Gratuit, sans compte · ≤ 10 participants · QCM
                  </span>
                </button>
                <button
                  type="button"
                  className={`choice-card${mode === "examen" ? " choice-card--on" : ""}`}
                  aria-pressed={mode === "examen"}
                  onClick={chooseExamen}
                  data-tour="mode-examen"
                >
                  <span className="choice-card__icon" aria-hidden="true">
                    <Icon name="graduationCap" size={19} />
                  </span>
                  <span className="choice-card__title">Examen</span>
                  <span className="choice-card__desc">
                    Note /20 · réponse libre · export PDF · historique
                  </span>
                </button>
              </div>
              {mode === "examen" && (
                <div className="stack gap-8" style={{ marginTop: 12 }}>
                  <div
                    className="choice-cards"
                    role="group"
                    aria-label="Capacité de l'examen"
                    data-tour="capacity"
                  >
                    <button
                      type="button"
                      className={`choice-card choice-card--sm${capacity === "small" ? " choice-card--on" : ""}`}
                      aria-pressed={capacity === "small"}
                      onClick={() => setCapacity("small")}
                    >
                      <span className="choice-card__icon" aria-hidden="true">
                        <Icon name="users" size={16} />
                      </span>
                      <span>
                        <span className="choice-card__title">≤ 20 participants</span>
                        <span className="choice-card__desc" style={{ display: "block" }}>
                          <span className="money">1 000 Ar</span>
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`choice-card choice-card--sm${capacity === "unlimited" ? " choice-card--on" : ""}`}
                      aria-pressed={capacity === "unlimited"}
                      onClick={() => setCapacity("unlimited")}
                    >
                      <span className="choice-card__icon" aria-hidden="true">
                        <Icon name="sparkles" size={16} />
                      </span>
                      <span>
                        <span className="choice-card__title">Illimité</span>
                        <span className="choice-card__desc" style={{ display: "block" }}>
                          <span className="money">2 000 Ar</span>
                        </span>
                      </span>
                    </button>
                  </div>
                  <p className="hint">
                    <Icon name="wallet" size={14} />
                    Débité en fin de session (paiement à venir).
                  </p>
                  {classes.length > 0 && (
                    <div data-tour="class-select">
                      <label className="label" htmlFor="cls">Classe (optionnel)</label>
                      <select
                        id="cls"
                        className="input"
                        value={classId}
                        onChange={(e) => setClassId(e.target.value)}
                      >
                        <option value="">Aucune — pseudos libres</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.studentCount})
                          </option>
                        ))}
                      </select>
                      <p className="hint" style={{ marginTop: 8 }}>
                        <Icon name="users" size={14} />
                        Chaque participant choisit son nom dans la liste —
                        résultats nominatifs.
                      </p>
                    </div>
                  )}
                  {account &&
                    (canAfford(account.balanceAr, plannedPriceAr) ? (
                      <p className="hint">
                        <Icon name="check" size={14} />
                        {account.email} · solde{" "}
                        <span className="money">{account.balanceAr} Ar</span>
                      </p>
                    ) : (
                      // Prévenir MAINTENANT, au calme : sans cela le blocage
                      // tombe au lancement, devant la classe (voir lobby).
                      <div className="error" role="alert">
                        <div>
                          Il vous manque{" "}
                          <span className="money">
                            {plannedPriceAr - (account.balanceAr || 0)} Ar
                          </span>{" "}
                          pour cet examen (solde :{" "}
                          <span className="money">{account.balanceAr} Ar</span>).
                        </div>
                        <div className="stack gap-8" style={{ marginTop: 10 }}>
                          <Link href="/host/wallet" className="btn btn--primary btn--compact">
                            <Icon name="creditCard" size={15} /> Recharger maintenant
                          </Link>
                          <button
                            type="button"
                            className="btn btn--ghost btn--compact"
                            onClick={() => setMode("libre")}
                          >
                            Passer en mode Libre (gratuit)
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
            {error && <div className="error" role="alert">{error}</div>}
            <button
              type="submit"
              className="btn btn--primary btn--lg btn--block"
              disabled={busy}
              data-tour="submit"
            >
              {busy ? (
                "…"
              ) : (
                <>
                  Créer la salle <Icon name="arrowRight" size={16} />
                </>
              )}
            </button>
          </form>
          {showAside && (
            <aside className="card stack gap-12" data-tour="aside">
              <span className="eyebrow">Premiers pas · mode Examen</span>
              <p className="hint">
                <Icon name="penLine" size={15} /> Construisez le quiz — la
                réponse libre est incluse.
              </p>
              <p className="hint">
                <Icon name="wallet" size={15} /> Rechargez votre solde au
                lancement (actuellement 0 Ar).
              </p>
              <p className="hint">
                <Icon name="graduationCap" size={15} /> Corrigez, publiez —
                notes et historique sauvegardés.
              </p>
              {/* On est déjà sur /host : on relance la visite sur place plutôt
                  que de naviguer vers ?tour=1, ce qui remonterait la page. */}
              <button
                type="button"
                className="btn btn--ghost"
                style={{ alignSelf: "flex-start" }}
                onClick={() =>
                  window.dispatchEvent(new CustomEvent(TOUR_START_EVENT))
                }
              >
                <Icon name="play" size={14} /> Visite guidée (30 s)
              </button>
              <Link
                href="/host/classes"
                className="tiny"
                style={{ color: "var(--accent-bright)" }}
              >
                Astuce : une classe = examens nominatifs + carnet de notes →
              </Link>
            </aside>
          )}
        </div>
        {showAuth && (
          <AuthModal
            onClose={() => setShowAuth(false)}
            onAuthed={(acc) => {
              setAccount(acc);
              setShowAuth(false);
              setMode("examen");
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="stack gap-24">
      <div className="row row--between wrap gap-12">
        <div className="stack gap-8">
          <span className="eyebrow">Configuration · {questions.length} question
            {questions.length > 1 ? "s" : ""}</span>
          <h1 style={{ fontSize: "1.8rem" }}>{title || "Quiz"}</h1>
        </div>
        <div className="panel row gap-12" style={{ padding: "10px 16px" }}>
          <span className="tiny muted">Code à partager</span>
          <span className="code-chip">{code}</span>
        </div>
      </div>

      <div className="stack gap-16">
        {questions.map((q, i) => (
          <QuestionBuilder
            key={q.id}
            question={q}
            index={i}
            mode={mode}
            onChange={(nq) => updateQuestion(i, nq)}
            onRemove={() => removeQuestion(i)}
            canRemove={questions.length > 1}
          />
        ))}
      </div>

      <button type="button" className="btn btn--ghost btn--block" onClick={addQuestion}>
        <Icon name="plus" size={16} /> Ajouter une question
      </button>

      {error && <div className="error" role="alert">{error}</div>}

      <button
        type="button"
        className="btn btn--primary btn--lg btn--block"
        onClick={saveAndLaunch}
        disabled={busy}
      >
        {busy ? (
          "Enregistrement…"
        ) : (
          <>
            Enregistrer et aller au lancement <Icon name="arrowRight" size={16} />
          </>
        )}
      </button>
    </div>
  );
}

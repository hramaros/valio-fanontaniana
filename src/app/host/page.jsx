"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import QuestionBuilder from "@/components/QuestionBuilder";
import { apiGet, apiPost } from "@/lib/api";
import { generateId } from "@/lib/code";
import { DEFAULT_COLORS } from "@/lib/shapes";
import { saveHostSession } from "@/lib/session";
import { useAccount } from "@/lib/account-client";
import AuthModal from "@/components/AuthModal";
import Brand from "@/components/Brand";
import Icon from "@/components/Icon";

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

  // Visite guidée au premier accès d'un formateur connecté (non onboardé).
  useEffect(() => {
    if (!account) return;
    try {
      if (!localStorage.getItem("valio:onboarded")) router.replace("/host/welcome");
    } catch {}
  }, [account, router]);

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

  if (step === "identity") {
    return (
      <div className="center-screen">
        <div className="container container--narrow stack gap-24">
          <div className="row row--between">
            <Link href="/" className="pill">← Accueil</Link>
            {account && (
              <span className="row gap-8">
                <Link href="/host/dashboard" className="pill">Tableau de bord</Link>
                <Link href="/host/classes" className="pill">Classes</Link>
                <Link href="/host/history" className="pill">Mes examens</Link>
              </span>
            )}
          </div>
          {account && account.balanceAr === 0 && (
            <div className="card stack gap-8">
              <span className="eyebrow">Premiers pas · mode Examen</span>
              <ol className="muted" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
                <li>Construisez votre quiz (réponse libre disponible en mode Examen).</li>
                <li>Au lancement, rechargez votre solde (actuellement 0 Ar).</li>
                <li>Lancez, corrigez, publiez — notes et historique sauvegardés.</li>
              </ol>
              <Link
                href="/host/welcome"
                className="btn btn--ghost"
                style={{ alignSelf: "flex-start" }}
              >
                <Icon name="play" size={14} /> Visite guidée (30 s)
              </Link>
              <Link
                href="/host/classes"
                className="tiny"
                style={{ color: "var(--accent-bright)" }}
              >
                Astuce : créez une classe pour des examens nominatifs + un carnet de notes →
              </Link>
            </div>
          )}
          <form className="card stack gap-16" onSubmit={createRoom}>
            <span className="eyebrow">Espace formateur</span>
            <h1 style={{ fontSize: "2rem" }}>Configurer un quiz</h1>
            <div>
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
            <div>
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
            <div>
              <label className="label" htmlFor="dur">
                Temps total du quiz (secondes)
              </label>
              <input
                id="dur"
                type="number"
                className="input"
                min={10}
                step={10}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
              <p className="tiny muted" style={{ marginTop: 6 }}>
                Un seul chrono pour tout le quiz. Chacun répond à son rythme.
              </p>
            </div>
            <div>
              <label className="label">Mode</label>
              <div className="seg" role="group" aria-label="Mode du quiz">
                <button
                  type="button"
                  aria-pressed={mode === "libre"}
                  onClick={() => setMode("libre")}
                >
                  Libre (gratuit)
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "examen"}
                  onClick={chooseExamen}
                >
                  Examen
                </button>
              </div>
              {mode === "libre" ? (
                <p className="tiny muted" style={{ marginTop: 6 }}>
                  Gratuit, sans compte — jusqu'à 10 participants. QCM uniquement.
                </p>
              ) : (
                <div className="stack gap-8" style={{ marginTop: 10 }}>
                  <div className="seg" role="group" aria-label="Capacité de l'examen">
                    <button
                      type="button"
                      aria-pressed={capacity === "small"}
                      onClick={() => setCapacity("small")}
                    >
                      ≤ 20 participants · 1 000 Ar
                    </button>
                    <button
                      type="button"
                      aria-pressed={capacity === "unlimited"}
                      onClick={() => setCapacity("unlimited")}
                    >
                      Illimité · 2 000 Ar
                    </button>
                  </div>
                  <p className="tiny muted">
                    Débloque la réponse libre et l'export. Débité en fin de session
                    (paiement à venir).
                  </p>
                  {classes.length > 0 && (
                    <div>
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
                      <p className="tiny muted" style={{ marginTop: 6 }}>
                        Avec une classe, les participants choisissent leur nom dans la
                        liste (résultats nominatifs).
                      </p>
                    </div>
                  )}
                  {account && (
                    <p className="tiny muted">
                      Connecté : {account.email} · Solde : {account.balanceAr} Ar
                    </p>
                  )}
                </div>
              )}
            </div>
            {error && <div className="error" role="alert">{error}</div>}
            <button
              type="submit"
              className="btn btn--primary btn--lg btn--block"
              disabled={busy}
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
    <div className="container stack gap-24">
      <div className="row row--between wrap gap-12">
        <Brand as="span" />
        <div className="panel row gap-12" style={{ padding: "10px 16px" }}>
          <span className="tiny muted">Code à partager</span>
          <span className="code-chip">{code}</span>
        </div>
      </div>

      <div className="stack gap-8">
        <span className="eyebrow">Configuration · {questions.length} question
          {questions.length > 1 ? "s" : ""}</span>
        <h1 style={{ fontSize: "1.8rem" }}>{title || "Quiz"}</h1>
        <p className="muted">
          Ajoutez vos questions et réponses, choisissez le type et les couleurs.
        </p>
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
        + Ajouter une question
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

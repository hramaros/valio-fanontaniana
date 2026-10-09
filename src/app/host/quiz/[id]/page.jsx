"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import QuestionBuilder from "@/components/QuestionBuilder";
import Icon from "@/components/Icon";
import EmptyState from "@/components/EmptyState";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { generateId } from "@/lib/code";
import { DEFAULT_COLORS } from "@/lib/shapes";
import { useAccount } from "@/lib/account-client";
import { reprendreImport } from "@/lib/quizImportHandoff";

// Éditeur de quiz de la bibliothèque.
//
// La même page sert à créer et à modifier : `/host/quiz/nouveau` est traité
// comme un identifiant réservé. C'est ce qui permet à l'import Google Forms
// d'atterrir ici sans que rien n'ait été enregistré — un formulaire qui n'est
// pas un questionnaire n'a aucune bonne réponse, et serait refusé tel quel.
// L'enregistrement est donc le moment où la validation s'applique.
const NOUVEAU = "nouveau";

function questionVide() {
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

export default function QuizEditorPage() {
  const { id } = useParams();
  const router = useRouter();
  const { account, loading } = useAccount();

  const [pret, setPret] = useState(false);
  const [introuvable, setIntrouvable] = useState(false);
  const [titre, setTitre] = useState("");
  const [mode, setMode] = useState("examen");
  const [capacity, setCapacity] = useState("small");
  const [duree, setDuree] = useState(120);
  const [questions, setQuestions] = useState([]);
  const [origine, setOrigine] = useState(null); // { source, sourceUrl }
  const [rapport, setRapport] = useState(null); // { ignores, corrigeDetecte }
  const [erreur, setErreur] = useState("");
  const [busy, setBusy] = useState(false);

  const creation = id === NOUVEAU;

  useEffect(() => {
    if (!account) return;

    if (creation) {
      // Import en attente, déposé par la page bibliothèque (lu puis effacé).
      const charge = reprendreImport();
      if (charge?.quiz) {
        setTitre(charge.quiz.title || "");
        setMode(charge.quiz.mode || "examen");
        setCapacity(charge.quiz.capacity || "small");
        setDuree(charge.quiz.totalDurationSec || 120);
        setQuestions(
          (charge.quiz.questions || []).map((q) => ({
            ...q,
            id: q.id || generateId("q"),
            answers: (q.answers || []).map((a, i) => ({
              ...a,
              id: a.id || generateId("a"),
              color: a.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
            })),
          })),
        );
        setOrigine({ source: "google-forms", sourceUrl: charge.sourceUrl });
        setRapport({
          ignores: charge.ignores || [],
          corrigeDetecte: !!charge.corrigeDetecte,
        });
      } else {
        setTitre("");
        setQuestions([questionVide()]);
      }
      setPret(true);
      return;
    }

    (async () => {
      const { ok, data } = await apiGet(`/api/host/quiz/${id}`);
      if (!ok) {
        setIntrouvable(true);
        setPret(true);
        return;
      }
      const q = data.quiz;
      setTitre(q.title);
      setMode(q.mode);
      setCapacity(q.capacity);
      setDuree(q.totalDurationSec);
      setQuestions(q.questions);
      setOrigine({ source: q.source, sourceUrl: q.sourceUrl });
      setPret(true);
    })();
  }, [account, id, creation]);

  function majQuestion(i, q) {
    setQuestions((prev) => prev.map((item, idx) => (idx === i ? q : item)));
  }
  function retirer(i) {
    setQuestions((prev) => prev.filter((_, idx) => idx !== i));
  }
  function ajouter() {
    setQuestions((prev) => [...prev, questionVide()]);
  }

  async function enregistrer() {
    setErreur("");
    setBusy(true);
    const quiz = {
      title: titre.trim() || "Quiz",
      mode,
      capacity,
      totalDurationSec: Number(duree),
      questions,
    };
    const res = creation
      ? await apiPost("/api/host/quiz", {
          quiz,
          source: origine?.source,
          sourceUrl: origine?.sourceUrl,
        })
      : await apiPut(`/api/host/quiz/${id}`, { quiz });
    setBusy(false);
    if (!res.ok) {
      setErreur(res.data?.error || "Quiz invalide.");
      return;
    }
    router.push("/host/quiz");
  }

  if (loading || !pret) {
    return (
      <div className="center-work">
        <div className="spin" role="status" aria-label="Chargement" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="center-work">
        <div className="card" style={{ maxWidth: 440 }}>
          <EmptyState icon="bookOpen" title="Mes quiz">
            <p>Connectez-vous pour modifier vos quiz.</p>
            <Link href="/host" className="btn btn--primary">Créer un quiz</Link>
          </EmptyState>
        </div>
      </div>
    );
  }

  if (introuvable) {
    return (
      <div className="center-work">
        <div className="card stack gap-16" style={{ textAlign: "center", maxWidth: 420 }}>
          <h2>Quiz introuvable</h2>
          <Link href="/host/quiz" className="btn btn--primary">Retour à mes quiz</Link>
        </div>
      </div>
    );
  }

  const aCorriger =
    rapport && !rapport.corrigeDetecte && questions.some((q) => q.answers?.length);

  return (
    <div className="stack gap-24">
      <div className="row row--between wrap gap-12">
        <div className="stack gap-4">
          <span className="eyebrow">
            {creation ? "Nouveau quiz" : "Modifier"}
            {origine?.source === "google-forms" ? " · importé de Google Forms" : ""}
          </span>
          <h1 style={{ fontSize: "1.8rem" }}>
            {titre.trim() || "Quiz sans titre"}
          </h1>
        </div>
        <Link href="/host/quiz" className="btn btn--ghost btn--compact">
          <Icon name="chevronLeft" size={15} /> Mes quiz
        </Link>
      </div>

      {/* — Rapport d'import — */}
      {aCorriger && (
        <div className="panel" role="alert">
          <p className="hint">
            <Icon name="alertTriangle" size={15} />
            <span>
              Ce formulaire n&apos;était pas un <strong>questionnaire</strong> :
              aucune bonne réponse n&apos;y était définie. Désignez-les
              ci-dessous — l&apos;enregistrement les exige.
            </span>
          </p>
        </div>
      )}

      {rapport?.ignores?.length > 0 && (
        <div className="panel stack gap-8">
          <p className="hint">
            <Icon name="info" size={15} />
            <span>
              {rapport.ignores.length} élément
              {rapport.ignores.length > 1 ? "s" : ""} du formulaire n&apos;
              {rapport.ignores.length > 1 ? "ont" : "a"} pas pu être repris.
              À ressaisir à la main si besoin :
            </span>
          </p>
          <ul className="stack gap-4" style={{ margin: 0, paddingLeft: 18 }}>
            {rapport.ignores.map((x, i) => (
              <li key={i} className="tiny muted">
                <strong>{x.titre}</strong> — {x.raison}
              </li>
            ))}
          </ul>
        </div>
      )}

      {erreur && (
        <div className="panel" role="alert">
          <p className="hint">
            <Icon name="alertTriangle" size={15} /> {erreur}
          </p>
        </div>
      )}

      {/* — Réglages — */}
      <div className="card stack gap-16">
        <div>
          <label className="label" htmlFor="titre">Titre</label>
          <input
            id="titre"
            className="input"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            maxLength={120}
            placeholder="Contrôle de géométrie"
          />
        </div>

        <div>
          <label className="label" htmlFor="duree">Temps total (secondes)</label>
          <div className="stack gap-8">
            <div className="chips" role="group" aria-label="Durées proposées">
              {[60, 120, 300, 600].map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`chip${Number(duree) === s ? " chip--on" : ""}`}
                  onClick={() => setDuree(s)}
                >
                  <Icon name="timer" size={14} />
                  {s < 60 ? `${s} s` : `${s / 60} min`}
                </button>
              ))}
            </div>
            <input
              id="duree"
              type="number"
              className="input"
              min={10}
              step={10}
              value={duree}
              onChange={(e) => setDuree(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label">Mode</label>
          <div className="chips" role="group" aria-label="Mode du quiz">
            {[
              ["examen", "Examen — noté, /20"],
              ["libre", "Libre — gratuit, 10 max"],
            ].map(([v, l]) => (
              <button
                key={v}
                type="button"
                className={`chip${mode === v ? " chip--on" : ""}`}
                onClick={() => setMode(v)}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            <Icon name="info" size={14} />
            Les questions à saisie (réponse courte, numérique, rédaction)
            exigent le mode Examen.
          </p>
        </div>

        {mode === "examen" && (
          <div>
            <label className="label">Capacité</label>
            <div className="chips" role="group" aria-label="Capacité">
              {[
                ["small", "Jusqu'à 20 · 1 000 Ar"],
                ["unlimited", "Illimité · 2 000 Ar"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  className={`chip${capacity === v ? " chip--on" : ""}`}
                  onClick={() => setCapacity(v)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* — Questions — */}
      <div className="stack gap-16">
        <div className="row row--between wrap gap-8">
          <span className="eyebrow">
            {questions.length} question{questions.length > 1 ? "s" : ""}
          </span>
          <button type="button" className="btn btn--ghost btn--compact" onClick={ajouter}>
            <Icon name="plus" size={15} /> Ajouter
          </button>
        </div>

        {questions.map((q, i) => (
          <QuestionBuilder
            key={q.id || i}
            question={q}
            index={i}
            mode={mode}
            onChange={(next) => majQuestion(i, next)}
            onRemove={() => retirer(i)}
            canRemove={questions.length > 1}
          />
        ))}
      </div>

      <div className="stack gap-8">
        <button
          type="button"
          className="btn btn--primary btn--lg btn--block"
          disabled={busy}
          onClick={enregistrer}
        >
          {busy ? "Enregistrement…" : creation ? "Enregistrer dans mes quiz" : "Enregistrer"}
        </button>
        <Link href="/host/quiz" className="btn btn--ghost btn--block">
          Annuler
        </Link>
      </div>
    </div>
  );
}

"use client";
import { generateId } from "@/lib/code";
import { DEFAULT_COLORS } from "@/lib/shapes";
import Icon from "@/components/Icon";

export default function QuestionBuilder({
  question,
  index,
  mode = "libre",
  onChange,
  onRemove,
  canRemove,
}) {
  function patch(fields) {
    onChange({ ...question, ...fields });
  }

  function setType(type) {
    let answers = question.answers;
    // En choix unique, on ne garde qu'une seule bonne réponse.
    if (type === "single") {
      let kept = false;
      answers = answers.map((a) => {
        if (a.correct && !kept) {
          kept = true;
          return a;
        }
        return { ...a, correct: false };
      });
    }
    patch({ type, answers });
  }

  // Types répondus au clavier : ils n'ont pas de tuiles de réponse à éditer.
  const isTextInput = ["free", "short", "number"].includes(question.type);

  // Préréglage Vrai/Faux : un choix unique avec deux réponses figées.
  const isTrueFalse =
    question.type === "single" &&
    question.answers?.length === 2 &&
    question.answers[0]?.text === "Vrai" &&
    question.answers[1]?.text === "Faux";

  function setTrueFalse() {
    patch({
      type: "single",
      answers: [
        { id: generateId("a"), text: "Vrai", color: DEFAULT_COLORS[0], correct: true },
        { id: generateId("a"), text: "Faux", color: DEFAULT_COLORS[1], correct: false },
      ],
    });
  }

  // Réponses acceptées (type « short »). Au moins un champ toujours affiché.
  const accepted = question.accepted?.length ? question.accepted : [""];
  function patchAccepted(i, value) {
    const next = [...accepted];
    next[i] = value;
    patch({ accepted: next });
  }
  function addAccepted() {
    if (accepted.length >= 10) return;
    patch({ accepted: [...accepted, ""] });
  }
  function removeAccepted(i) {
    if (accepted.length <= 1) return;
    patch({ accepted: accepted.filter((_, idx) => idx !== i) });
  }

  function patchAnswer(id, fields) {
    let answers = question.answers.map((a) =>
      a.id === id ? { ...a, ...fields } : a,
    );
    // Choix unique : cocher une bonne réponse décoche les autres.
    if (question.type === "single" && fields.correct === true) {
      answers = answers.map((a) =>
        a.id === id ? a : { ...a, correct: false },
      );
    }
    patch({ answers });
  }

  function addAnswer() {
    if (question.answers.length >= 6) return;
    const i = question.answers.length;
    patch({
      answers: [
        ...question.answers,
        {
          id: generateId("a"),
          text: "",
          color: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
          correct: false,
        },
      ],
    });
  }

  function removeAnswer(id) {
    if (question.answers.length <= 2) return;
    patch({ answers: question.answers.filter((a) => a.id !== id) });
  }

  return (
    <div className="q-card">
      <div className="q-head">
        <span className="q-index">{index + 1}</span>
        <div
          className="choice-cards--row"
          role="group"
          aria-label="Type de réponse"
          style={{ flex: 1 }}
        >
          <button
            type="button"
            className={`choice-card choice-card--sm${question.type === "single" ? " choice-card--on" : ""}`}
            aria-pressed={question.type === "single"}
            onClick={() => setType("single")}
          >
            <span className="choice-card__icon" aria-hidden="true">
              <Icon name="circleDot" size={16} />
            </span>
            <span className="choice-card__title">Choix unique</span>
          </button>
          <button
            type="button"
            className={`choice-card choice-card--sm${question.type === "multiple" ? " choice-card--on" : ""}`}
            aria-pressed={question.type === "multiple"}
            onClick={() => setType("multiple")}
          >
            <span className="choice-card__icon" aria-hidden="true">
              <Icon name="listChecks" size={16} />
            </span>
            <span className="choice-card__title">Choix multiple</span>
          </button>
          {/* Vrai/Faux n'est pas un type à part : c'est un préréglage du choix
              unique. Rien de plus à maintenir côté moteur, et le formateur
              gagne les deux saisies quand il enchaîne les questions. */}
          <button
            type="button"
            className={`choice-card choice-card--sm${isTrueFalse ? " choice-card--on" : ""}`}
            aria-pressed={isTrueFalse}
            onClick={setTrueFalse}
          >
            <span className="choice-card__icon" aria-hidden="true">
              <Icon name="check" size={16} />
            </span>
            <span className="choice-card__title">Vrai / Faux</span>
          </button>
          {mode === "examen" && (
            <>
              <button
                type="button"
                className={`choice-card choice-card--sm${question.type === "short" ? " choice-card--on" : ""}`}
                aria-pressed={question.type === "short"}
                onClick={() => setType("short")}
              >
                <span className="choice-card__icon" aria-hidden="true">
                  <Icon name="penLine" size={16} />
                </span>
                <span className="choice-card__title">Réponse courte</span>
              </button>
              <button
                type="button"
                className={`choice-card choice-card--sm${question.type === "number" ? " choice-card--on" : ""}`}
                aria-pressed={question.type === "number"}
                onClick={() => setType("number")}
              >
                <span className="choice-card__icon" aria-hidden="true">
                  <Icon name="hash" size={16} />
                </span>
                <span className="choice-card__title">Numérique</span>
              </button>
              <button
                type="button"
                className={`choice-card choice-card--sm${question.type === "free" ? " choice-card--on" : ""}`}
                aria-pressed={question.type === "free"}
                onClick={() => setType("free")}
              >
                <span className="choice-card__icon" aria-hidden="true">
                  <Icon name="bookOpen" size={16} />
                </span>
                <span className="choice-card__title">Rédaction</span>
              </button>
            </>
          )}
        </div>
        {canRemove && (
          <button
            type="button"
            className="btn btn--danger btn--icon"
            onClick={onRemove}
            aria-label={`Supprimer la question ${index + 1}`}
            title="Supprimer la question"
          >
            <Icon name="trash" size={17} />
          </button>
        )}
      </div>

      <input
        className="input"
        placeholder="Énoncé de la question"
        aria-label={`Énoncé de la question ${index + 1}`}
        value={question.text}
        onChange={(e) => patch({ text: e.target.value })}
        maxLength={500}
      />

      {question.type === "free" ? (
        <div>
          <label className="label" htmlFor={`ref-${question.id}`}>
            Réponse attendue (optionnel — visible par vous seul)
          </label>
          <input
            id={`ref-${question.id}`}
            className="input"
            placeholder="ex. Antananarivo"
            value={question.reference || ""}
            onChange={(e) => patch({ reference: e.target.value })}
            maxLength={240}
          />
          <p className="hint" style={{ marginTop: 8 }}>
            <Icon name="bookOpen" size={15} />
            Réponse rédigée — vous la corrigez vous-même après le chrono.
          </p>
        </div>
      ) : question.type === "short" ? (
        <div className="stack gap-8">
          <label className="label">Réponses acceptées</label>
          {accepted.map((value, i) => (
            <div className="row gap-8" key={i}>
              <input
                className="input"
                placeholder={i === 0 ? "ex. Antananarivo" : "autre formulation acceptée"}
                aria-label={`Réponse acceptée ${i + 1}`}
                value={value}
                onChange={(e) => patchAccepted(i, e.target.value)}
                maxLength={120}
              />
              {accepted.length > 1 && (
                <button
                  type="button"
                  className="btn btn--danger btn--icon"
                  onClick={() => removeAccepted(i)}
                  aria-label={`Supprimer la réponse acceptée ${i + 1}`}
                >
                  <Icon name="trash" size={16} />
                </button>
              )}
            </div>
          ))}
          {accepted.length < 10 && (
            <button type="button" className="btn btn--ghost" onClick={addAccepted}>
              <Icon name="plus" size={15} /> Ajouter une formulation
            </button>
          )}
          <p className="hint">
            <Icon name="check" size={15} />
            Corrigée automatiquement. La casse, les accents et les espaces sont
            ignorés — ajoutez une ligne par formulation que vous acceptez.
          </p>
        </div>
      ) : question.type === "number" ? (
        <div className="stack gap-8">
          <div className="row gap-8">
            <div style={{ flex: 1 }}>
              <label className="label" htmlFor={`exp-${question.id}`}>
                Valeur attendue
              </label>
              <input
                id={`exp-${question.id}`}
                className="input"
                type="number"
                step="any"
                inputMode="decimal"
                placeholder="ex. 12"
                value={question.expected ?? ""}
                onChange={(e) => patch({ expected: e.target.value })}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="label" htmlFor={`tol-${question.id}`}>
                Tolérance ±
              </label>
              <input
                id={`tol-${question.id}`}
                className="input"
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                placeholder="0"
                value={question.tolerance ?? ""}
                onChange={(e) => patch({ tolerance: e.target.value })}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="label" htmlFor={`unit-${question.id}`}>
                Unité (optionnel)
              </label>
              <input
                id={`unit-${question.id}`}
                className="input"
                placeholder="ex. cm"
                value={question.unit || ""}
                onChange={(e) => patch({ unit: e.target.value })}
                maxLength={16}
              />
            </div>
          </div>
          <p className="hint">
            <Icon name="check" size={15} />
            Corrigée automatiquement. La virgule est acceptée comme séparateur
            décimal. L&apos;unité est seulement affichée : l&apos;élève ne saisit
            que le nombre.
          </p>
        </div>
      ) : (
        <div className="stack gap-8">
        {question.answers.map((a, i) => (
          <div className="ans-edit" key={a.id}>
            <input
              type="color"
              className="color-dot"
              value={a.color}
              onChange={(e) => patchAnswer(a.id, { color: e.target.value })}
              title="Couleur"
              aria-label={`Couleur de la réponse ${i + 1}`}
            />
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder={`Réponse ${i + 1}`}
              aria-label={`Texte de la réponse ${i + 1}`}
              value={a.text}
              onChange={(e) => patchAnswer(a.id, { text: e.target.value })}
              maxLength={240}
            />
            <label className="check">
              <input
                type={question.type === "single" ? "radio" : "checkbox"}
                name={`correct-${question.id}`}
                checked={a.correct}
                onChange={(e) => patchAnswer(a.id, { correct: e.target.checked })}
              />
              Bonne
            </label>
            {question.answers.length > 2 && (
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                onClick={() => removeAnswer(a.id)}
                aria-label={`Retirer la réponse ${i + 1}`}
              >
                <Icon name="close" size={16} />
              </button>
            )}
          </div>
        ))}
        </div>
      )}

      <div className="row gap-12 wrap">
        {!isTextInput && question.answers.length < 6 && (
          <button type="button" className="btn btn--ghost" onClick={addAnswer}>
            <Icon name="plus" size={15} /> Réponse
          </button>
        )}
        {/* Ce poids sert deux fois : au score de jeu et, depuis le barème
            pondéré, au calcul de la note /20. D'où le libellé « Barème ». */}
        <label className="check" style={{ marginLeft: "auto" }} title="Poids de la question dans la note /20">
          Barème
          <input
            type="number"
            className="input"
            style={{ width: 90 }}
            min={100}
            step={100}
            value={question.basePoints}
            onChange={(e) =>
              patch({ basePoints: Math.max(100, Number(e.target.value) || 0) })
            }
          />
        </label>
      </div>
    </div>
  );
}

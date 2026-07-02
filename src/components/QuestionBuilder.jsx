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
        <div className="seg" role="group" aria-label="Type de réponse">
          <button
            type="button"
            aria-pressed={question.type === "single"}
            onClick={() => setType("single")}
          >
            Choix unique
          </button>
          <button
            type="button"
            aria-pressed={question.type === "multiple"}
            onClick={() => setType("multiple")}
          >
            Choix multiple
          </button>
          {mode === "examen" && (
            <button
              type="button"
              aria-pressed={question.type === "free"}
              onClick={() => setType("free")}
            >
              Réponse libre
            </button>
          )}
        </div>
        <div className="spacer" />
        {canRemove && (
          <button
            type="button"
            className="btn btn--danger"
            style={{ padding: "8px 12px" }}
            onClick={onRemove}
          >
            Supprimer
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
          <p className="tiny muted" style={{ marginTop: 6 }}>
            Les participants saisissent leur réponse au clavier. Vous validerez
            chaque réponse manuellement après le chrono.
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
        {question.type !== "free" && question.answers.length < 6 && (
          <button type="button" className="btn btn--ghost" onClick={addAnswer}>
            + Réponse
          </button>
        )}
        <label className="check" style={{ marginLeft: "auto" }}>
          Points
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

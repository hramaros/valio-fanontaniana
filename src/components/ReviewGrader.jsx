import Icon from "@/components/Icon";

// Paliers de crédit accordés à une rédaction. Cinq suffisent : au-delà, on
// délibère au lieu de corriger, et le gain de finesse est illusoire.
const CREDIT_STEPS = [
  { value: 0, label: "0", title: "Rien accordé" },
  { value: 0.25, label: "¼", title: "Un quart des points" },
  { value: 0.5, label: "½", title: "La moitié des points" },
  { value: 0.75, label: "¾", title: "Trois quarts des points" },
  { value: 1, label: "Tout", title: "Tous les points" },
];

// Vue formateur : note chaque rédaction, groupée par question.
export default function ReviewGrader({ review, onGrade }) {
  if (!review || review.questions.length === 0) return null;

  return (
    <div className="stack gap-16">
      {review.questions.map((q) => (
        <div key={q.id} className="card stack gap-12">
          <div>
            <span className="eyebrow">Réponse libre · {q.basePoints} pts</span>
            <h2 style={{ fontSize: "1.2rem", marginTop: 4 }}>{q.text}</h2>
            {q.reference && (
              <p className="hint" style={{ marginTop: 6 }}>
                <Icon name="info" size={14} />
                <span>
                  Réponse attendue : <strong>{q.reference}</strong>
                </span>
              </p>
            )}
          </div>

          {q.submissions.length === 0 ? (
            <p className="hint">
              <Icon name="inbox" size={15} /> Aucune réponse soumise.
            </p>
          ) : (
            <div className="stack gap-8">
              {q.submissions.map((s) => (
                <div key={s.playerId} className="grade-row">
                  <div className="grade-row__ans">
                    <div style={{ fontWeight: 700 }}>{s.pseudo}</div>
                    <div className="muted">
                      {s.text ? s.text : <em>(réponse vide)</em>}
                    </div>
                  </div>
                  {/* Cinq paliers plutôt que juste/faux : une rédaction se
                      corrige rarement en tout-ou-rien. Des boutons, pas un
                      curseur — on corrige vite et sans viser. */}
                  <div
                    className="row gap-8"
                    role="group"
                    aria-label={`Note de ${s.pseudo}`}
                  >
                    {CREDIT_STEPS.map((step) => {
                      const on = s.credit === step.value;
                      return (
                        <button
                          key={step.value}
                          type="button"
                          className={`btn btn--compact ${
                            on
                              ? step.value === 0
                                ? "btn--danger"
                                : "btn--primary"
                              : "btn--ghost"
                          }`}
                          aria-pressed={on}
                          title={step.title}
                          onClick={() => onGrade(q.id, s.playerId, step.value)}
                        >
                          {step.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

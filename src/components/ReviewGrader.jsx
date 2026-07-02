import Icon from "@/components/Icon";

// Vue formateur : valide / refuse chaque réponse libre, groupée par question.
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
              <p className="tiny muted" style={{ marginTop: 4 }}>
                Réponse attendue : <strong>{q.reference}</strong>
              </p>
            )}
          </div>

          {q.submissions.length === 0 ? (
            <p className="muted tiny">Aucune réponse soumise.</p>
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
                  <div className="row gap-8">
                    <button
                      type="button"
                      className={`btn btn--compact ${
                        s.correct === true ? "btn--primary" : "btn--ghost"
                      }`}
                      aria-pressed={s.correct === true}
                      onClick={() => onGrade(q.id, s.playerId, true)}
                    >
                      <Icon name="check" size={16} /> Valider
                    </button>
                    <button
                      type="button"
                      className={`btn btn--compact ${
                        s.correct === false ? "btn--danger" : "btn--ghost"
                      }`}
                      aria-pressed={s.correct === false}
                      onClick={() => onGrade(q.id, s.playerId, false)}
                    >
                      <Icon name="close" size={16} /> Refuser
                    </button>
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

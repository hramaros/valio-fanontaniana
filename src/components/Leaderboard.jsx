import Icon from "@/components/Icon";

export default function Leaderboard({ players, meId }) {
  if (!players || players.length === 0) {
    return <p className="muted">Aucun participant.</p>;
  }
  return (
    <div className="lb">
      {players.map((p) => (
        <div
          key={p.id}
          className={`lb-row${p.id === meId ? " lb-row--me" : ""}`}
        >
          <div className={`lb-rank${p.rank <= 3 ? ` lb-rank--${p.rank}` : ""}`}>
            {p.rank}
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>{p.pseudo}</div>
            <div className="lb-note row gap-8 wrap">
              <span>{p.note}/20</span>
              <span className="row" style={{ gap: 4 }}>
                <Icon name="check" size={13} /> {p.nbCorrect}
              </span>
            </div>
          </div>
          <div className="lb-score">{p.score}</div>
        </div>
      ))}
    </div>
  );
}

import Icon from "@/components/Icon";

// Ordre d'affichage : 2e à gauche, 1er au centre, 3e à droite.
export default function Podium({ podium }) {
  if (!podium || podium.length === 0) return null;
  const byRank = {};
  podium.forEach((p, i) => {
    byRank[i + 1] = p; // position d'affichage suit l'ordre du classement
  });
  const order = [2, 1, 3].filter((pos) => byRank[pos]);

  return (
    <div className="podium">
      {order.map((pos) => {
        const p = byRank[pos];
        return (
          <div className="podium-col" key={p.id}>
            <div className={`podium-medal podium-medal--${pos}`} aria-hidden="true">
              <Icon name="medal" size={28} />
            </div>
            <div className={`podium-card podium-${pos}`}>
              <div className="podium-name">{p.pseudo}</div>
              <div className="podium-score">{p.score}</div>
              <div className="lb-note">{p.note}/20</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

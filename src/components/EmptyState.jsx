import Icon from "@/components/Icon";

// État vide piloté par icône : badge circulaire + titre court + contenu
// optionnel (une ligne, une action). Markup pur, aucun état.
export default function EmptyState({ icon, title, inline = false, children }) {
  return (
    <div className={`empty-state${inline ? " empty-state--inline" : ""}`}>
      <span className="empty-state__icon" aria-hidden="true">
        <Icon name={icon} size={inline ? 18 : 24} />
      </span>
      <div className="stack gap-8" style={{ alignItems: inline ? "flex-start" : "center" }}>
        {title && <span className="empty-state__title">{title}</span>}
        {children}
      </div>
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Bouton de confirmation. Deux variantes :
 * - toggle (par défaut) : 1er clic relabellise le bouton en question, 2e
 *   clic dans le délai confirme — compact, pour les actions secondaires
 *   (supprimer une classe, retirer un élève).
 * - `split` : 1er clic affiche la question + deux boutons Oui/Non
 *   explicites, sans dépendre d'un second tap au même endroit — pour une
 *   action à conséquence plus lourde (ex. terminer un examen en cours pour
 *   tous les participants), où le geste doit être sans ambiguïté.
 */
export default function ConfirmButton({
  children,
  confirmLabel = "Confirmer ?",
  confirmYesLabel = "Oui",
  confirmNoLabel = "Non",
  onConfirm,
  className = "btn btn--danger",
  style,
  disabled = false,
  timeout = 3000,
  split = false,
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  function arm() {
    setArmed(true);
    timer.current = setTimeout(() => setArmed(false), split ? timeout * 2 : timeout);
  }

  function cancel() {
    clearTimeout(timer.current);
    setArmed(false);
  }

  function confirm() {
    clearTimeout(timer.current);
    setArmed(false);
    onConfirm();
  }

  function click() {
    if (disabled) return;
    if (armed && !split) confirm();
    else if (!armed) arm();
  }

  if (armed && split) {
    return (
      <div className="confirm-split" style={style}>
        <span className="tiny muted">{confirmLabel}</span>
        <div className="row gap-8">
          <button type="button" className="btn btn--ghost btn--compact" onClick={cancel}>
            {confirmNoLabel}
          </button>
          <button
            type="button"
            className="btn btn--primary btn--compact"
            disabled={disabled}
            onClick={confirm}
          >
            {confirmYesLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      style={style}
      disabled={disabled}
      aria-live="polite"
      onClick={click}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}

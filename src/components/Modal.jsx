"use client";
import { useEffect, useRef } from "react";

// Enveloppe de modale accessible : role="dialog", fermeture à Échap,
// clic sur le fond, et focus déplacé dans la boîte à l'ouverture.
export default function Modal({ onClose, labelledBy, maxWidth, children }) {
  const boxRef = useRef(null);

  useEffect(() => {
    const box = boxRef.current;
    // Focus initial : premier champ ou premier élément focusable.
    const target = box?.querySelector(
      "input, [autofocus], button, select, textarea, a[href]",
    );
    (target || box)?.focus?.();

    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={boxRef}
        className="modal stack gap-16"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        style={maxWidth ? { maxWidth } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

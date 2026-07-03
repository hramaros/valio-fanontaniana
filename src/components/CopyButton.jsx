"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

// Bouton de copie dans le presse-papiers avec confirmation « Copié ! »
// (annoncée aux lecteurs d'écran via aria-live).
export default function CopyButton({ value, label = "Copier", className = "btn btn--ghost btn--compact" }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Fallback (contexte non sécurisé / vieux navigateur) : zone temporaire.
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } finally {
        ta.remove();
      }
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      className={className}
      onClick={copy}
      aria-live="polite"
      title={`Copier : ${value}`}
    >
      <Icon name={copied ? "check" : "copy"} size={15} />
      {copied ? "Copié !" : label}
    </button>
  );
}

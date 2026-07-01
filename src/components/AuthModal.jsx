"use client";
import { useState } from "react";
import { apiPost } from "@/lib/api";

// Modale connexion / inscription du formateur (requise pour le mode Examen).
export default function AuthModal({ onClose, onAuthed }) {
  const [tab, setTab] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "1";

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const url = tab === "login" ? "/api/auth/login" : "/api/auth/signup";
    const body = tab === "login" ? { email, password } : { email, password, name };
    const { ok, data } = await apiPost(url, body);
    setBusy(false);
    if (!ok) {
      setError(data?.error || "Échec de l'opération.");
      return;
    }
    // Auth pendant la création d'un examen : on ne redirige pas vers la visite guidée.
    try {
      localStorage.setItem("valio:onboarded", "1");
    } catch {}
    onAuthed(data.account);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal stack gap-16" onClick={(e) => e.stopPropagation()}>
        <div className="row row--between">
          <div className="seg" role="group" aria-label="Connexion ou inscription">
            <button
              type="button"
              aria-pressed={tab === "login"}
              onClick={() => setTab("login")}
            >
              Connexion
            </button>
            <button
              type="button"
              aria-pressed={tab === "signup"}
              onClick={() => setTab("signup")}
            >
              Inscription
            </button>
          </div>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ padding: "6px 10px" }}
            onClick={onClose}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div className="stack gap-8" style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: "1.4rem" }}>
            {tab === "login" ? "Se connecter" : "Créer un compte formateur"}
          </h2>
          <p className="tiny muted">Requis pour lancer un examen (mode payant).</p>
        </div>

        {googleEnabled && (
          <>
            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={() => {
                window.location.href = "/api/auth/google";
              }}
            >
              Continuer avec Google
            </button>
            <div className="divider-or">ou</div>
          </>
        )}

        <form className="stack gap-12" onSubmit={submit}>
          {tab === "signup" && (
            <input
              className="input"
              placeholder="Votre nom"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
            />
          )}
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
          />
          <input
            className="input"
            type="password"
            placeholder="Mot de passe (6 caractères min.)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={tab === "login" ? "current-password" : "new-password"}
          />
          {error && <div className="error">{error}</div>}
          <button
            type="submit"
            className="btn btn--primary btn--lg btn--block"
            disabled={busy}
          >
            {busy ? "…" : tab === "login" ? "Connexion" : "Créer le compte"}
          </button>
        </form>
      </div>
    </div>
  );
}

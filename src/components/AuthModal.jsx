"use client";
import { useState } from "react";
import Image from "next/image";
import { apiPost } from "@/lib/api";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";

const linkButtonStyle = {
  background: "none",
  border: "none",
  color: "var(--accent-bright)",
  textDecoration: "underline",
  cursor: "pointer",
  padding: 0,
  font: "inherit",
};

// Modale connexion / inscription du formateur (requise pour le mode Examen).
export default function AuthModal({ onClose, onAuthed }) {
  const [tab, setTab] = useState("login"); // login | signup | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
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
    onAuthed(data.account);
  }

  async function submitForgot(e) {
    e.preventDefault();
    setBusy(true);
    await apiPost("/api/auth/password-reset/request", { email });
    setBusy(false);
    setForgotSent(true);
  }

  function backToLogin() {
    setTab("login");
    setForgotSent(false);
    setError("");
  }

  if (tab === "forgot") {
    return (
      <Modal onClose={onClose} labelledBy="auth-title">
        <div className="row row--between">
          <h2 id="auth-title" style={{ fontSize: "1.4rem" }}>
            Mot de passe oublié
          </h2>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={onClose}
            aria-label="Fermer"
          >
            <Icon name="close" />
          </button>
        </div>

        {forgotSent ? (
          <div className="empty-state">
            <span className="empty-state__icon" aria-hidden="true">
              <Icon name="mail" size={24} />
            </span>
            <span className="empty-state__title">Lien envoyé</span>
            <p>
              Si un compte existe pour cet email, vérifiez votre boîte de
              réception.
            </p>
          </div>
        ) : (
          <form className="stack gap-12" onSubmit={submitForgot}>
            <p className="hint">
              <Icon name="mail" size={15} />
              Si un compte existe, vous recevrez un lien pour choisir un
              nouveau mot de passe.
            </p>
            <div>
              <label className="label" htmlFor="forgot-email">
                Email
              </label>
              <input
                id="forgot-email"
                className="input"
                type="email"
                placeholder="vous@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="btn btn--primary btn--lg btn--block"
              disabled={busy || !email.trim()}
            >
              {busy ? "…" : "Envoyer le lien"}
            </button>
          </form>
        )}

        <p className="tiny muted" style={{ textAlign: "center" }}>
          <button type="button" style={linkButtonStyle} onClick={backToLogin}>
            Retour à la connexion
          </button>
        </p>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} labelledBy="auth-title">
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
          className="btn btn--ghost btn--icon"
          onClick={onClose}
          aria-label="Fermer"
        >
          <Icon name="close" />
        </button>
      </div>

      <div className="stack gap-8" style={{ textAlign: "center" }}>
        <h2 id="auth-title" style={{ fontSize: "1.4rem" }}>
          {tab === "login" ? "Connexion" : "Créer un compte formateur"}
        </h2>
        <p className="hint" style={{ justifyContent: "center" }}>
          <Icon name="lock" size={14} /> Requis pour le mode Examen.
        </p>
      </div>

      {googleEnabled && (
        <>
          <button
            type="button"
            className="btn btn--ghost btn--block row gap-8"
            style={{ justifyContent: "center" }}
            onClick={() => {
              window.location.href = "/api/auth/google";
            }}
          >
            <Image src="/icons/google.png" alt="" width={18} height={18} />
            Continuer avec Google
          </button>
          <div className="divider-or">ou</div>
        </>
      )}

      <form className="stack gap-12" onSubmit={submit}>
        {tab === "signup" && (
          <div>
            <label className="label" htmlFor="auth-name">
              Votre nom
            </label>
            <input
              id="auth-name"
              className="input"
              placeholder="ex. M. Rakoto"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoComplete="name"
            />
          </div>
        )}
        <div>
          <label className="label" htmlFor="auth-email">
            Email
          </label>
          <input
            id="auth-email"
            className="input"
            type="email"
            placeholder="vous@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
          />
        </div>
        <div>
          <label className="label" htmlFor="auth-password">
            Mot de passe{tab === "signup" ? " (6 caractères min.)" : ""}
          </label>
          <input
            id="auth-password"
            className="input"
            type="password"
            placeholder="••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={tab === "login" ? "current-password" : "new-password"}
          />
        </div>
        {tab === "login" && (
          <button
            type="button"
            style={{ ...linkButtonStyle, textAlign: "left" }}
            onClick={() => setTab("forgot")}
          >
            Mot de passe oublié ?
          </button>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button
          type="submit"
          className="btn btn--primary btn--lg btn--block"
          disabled={busy}
        >
          {busy ? "…" : tab === "login" ? "Connexion" : "Créer le compte"}
        </button>
      </form>
    </Modal>
  );
}

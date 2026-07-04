"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Brand from "@/components/Brand";
import Icon from "@/components/Icon";
import { apiPost } from "@/lib/api";

function ResetPasswordInner() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [revoke, setRevoke] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Mot de passe : 6 caractères minimum.");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    const { ok, data } = await apiPost("/api/auth/password-reset/confirm", {
      token,
      password,
      revokeOtherSessions: revoke,
    });
    setBusy(false);
    if (!ok) {
      setError(data?.error || "Lien invalide ou expiré.");
      return;
    }
    setDone(true);
    window.setTimeout(() => {
      window.location.href = "/host";
    }, 1200);
  }

  if (!token) {
    return (
      <div className="center-screen">
        <div
          className="container container--narrow stack gap-16"
          style={{ textAlign: "center" }}
        >
          <div className="row row--between">
            <Brand as="span" />
          </div>
          <h1 style={{ fontSize: "1.8rem" }}>Lien invalide</h1>
          <p className="muted">
            Ce lien de réinitialisation est incomplet. Redemandez un lien
            depuis la connexion (« Mot de passe oublié ? »).
          </p>
          <Link href="/" className="btn btn--primary">
            Retour à l'accueil
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="center-screen">
        <div
          className="container container--narrow stack gap-16"
          style={{ textAlign: "center" }}
        >
          <Brand as="span" />
          <h1 style={{ fontSize: "1.8rem" }}>Mot de passe mis à jour</h1>
          <p className="muted">Vous êtes connecté. Redirection…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="center-screen">
      <div className="container container--narrow stack gap-24">
        <div className="row row--between">
          <Brand as="span" />
        </div>

        <div className="stack gap-8">
          <span className="eyebrow">Réinitialisation</span>
          <h1 style={{ fontSize: "2rem" }}>Choisir un nouveau mot de passe</h1>
        </div>

        <form className="card stack gap-16" onSubmit={submit}>
          <div>
            <label className="label" htmlFor="reset-password">
              Nouveau mot de passe
            </label>
            <input
              id="reset-password"
              className="input"
              type="password"
              placeholder="•••••• (6 caractères min.)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="reset-password-confirm">
              Confirmer le mot de passe
            </label>
            <input
              id="reset-password-confirm"
              className="input"
              type="password"
              placeholder="••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={revoke}
              onChange={(e) => setRevoke(e.target.checked)}
            />
            Se déconnecter des autres appareils
          </label>
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
            {busy ? (
              "…"
            ) : (
              <>
                Réinitialiser <Icon name="arrowRight" size={18} />
              </>
            )}
          </button>
        </form>

        <p className="tiny muted" style={{ textAlign: "center" }}>
          <Link href="/">Retour à l'accueil</Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="center-screen">
          <div className="spin" role="status" aria-label="Chargement" />
        </div>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}

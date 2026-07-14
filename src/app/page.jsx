"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Brand from "@/components/Brand";
import Icon from "@/components/Icon";
import { apiPost } from "@/lib/api";
import { normalizeCode } from "@/lib/code";

export default function HomePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function participate(e) {
    e.preventDefault();
    const clean = normalizeCode(code);
    if (!clean) {
      setError("Entrez le code de la salle.");
      return;
    }
    setError("");
    setLoading(true);
    const { ok, data } = await apiPost(`/api/player/${clean}/join`);
    setLoading(false);
    if (!ok) {
      setError(data?.error || "Salle introuvable.");
      return;
    }
    router.push(`/join?code=${clean}`);
  }

  return (
    <div className="center-screen">
      <div className="container container--narrow stack gap-24">
        <div className="row row--between">
          <Brand as="span" />
        </div>

        <div className="hero stack gap-16">
          <h1>
            Un code, un pseudo, <em>et c'est parti.</em>
          </h1>
          <span className="quatuor-thread" aria-hidden="true" />
        </div>

        <form className="card stack gap-16" onSubmit={participate}>
          <div>
            <label className="label" htmlFor="code">
              Code de la salle
            </label>
            <input
              id="code"
              className="input input--code"
              placeholder="ABC123"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={8}
              autoComplete="off"
              autoFocus
            />
          </div>
          {error && <div className="error" role="alert">{error}</div>}
          <button
            type="submit"
            className="btn btn--primary btn--lg btn--block"
            disabled={loading}
          >
            {loading ? (
              "Connexion…"
            ) : (
              <>
                Participer <Icon name="arrowRight" size={18} />
              </>
            )}
          </button>
        </form>

        <div className="how-row">
          <div className="how-item">
            <span className="how-item__icon">
              <Icon name="hash" size={20} />
            </span>
            Le code
          </div>
          <span className="how-sep" aria-hidden="true">
            <Icon name="arrowRight" size={15} />
          </span>
          <div className="how-item">
            <span className="how-item__icon">
              <Icon name="users" size={20} />
            </span>
            Un pseudo
          </div>
          <span className="how-sep" aria-hidden="true">
            <Icon name="arrowRight" size={15} />
          </span>
          <div className="how-item">
            <span className="how-item__icon">
              <Icon name="play" size={20} />
            </span>
            C&apos;est parti
          </div>
        </div>

        <div className="divider-or">ou</div>
        <Link href="/host" className="btn btn--ghost btn--block">
          <Icon name="plus" size={16} /> Créer un quiz (formateur)
        </Link>

        <p className="tiny muted" style={{ textAlign: "center", margin: 0 }}>
          Parent ou établissement ?{" "}
          <Link href="/verifier">Vérifier les résultats d&apos;un examen</Link>
        </p>
      </div>
    </div>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Brand from "@/components/Brand";
import Icon, { ShapeStrip } from "@/components/Icon";
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
          <ShapeStrip size={22} />
          <h1>
            Un code, un pseudo, <em>et c'est parti.</em>
          </h1>
          <p className="muted">
            Rejoignez le quiz en direct lancé par votre formateur. Aucune
            inscription, juste le code de la salle.
          </p>
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

        <div className="divider-or">ou</div>
        <Link href="/host" className="btn btn--ghost btn--block">
          Créer un quiz (formateur)
        </Link>
      </div>
    </div>
  );
}

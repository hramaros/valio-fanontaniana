"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiGet, apiPost } from "@/lib/api";
import { normalizeCode } from "@/lib/code";
import { usePolling } from "@/lib/usePolling";
import RechargeModal from "@/components/RechargeModal";
import Icon from "@/components/Icon";

function LobbyInner() {
  const router = useRouter();
  const params = useSearchParams();
  const code = normalizeCode(params.get("code") || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recharge, setRecharge] = useState(null); // { priceAr, balanceAr } | null

  // Ne renvoie que des données valides : un payload d'erreur (salle expirée,
  // Redis indisponible…) ne doit jamais entrer dans l'état.
  const fetcher = useMemo(
    () => async () => {
      const { ok, status, data } = await apiGet(`/api/room/${code}/state`);
      if (ok) return data;
      return status === 404 ? { notFound: true } : undefined;
    },
    [code],
  );
  const state = usePolling(fetcher, 1200, true);

  // Si la partie est déjà lancée, on file vers le suivi des résultats.
  useEffect(() => {
    if (
      state &&
      ["running", "review", "ended"].includes(state.status)
    ) {
      router.replace(`/host/results?code=${code}`);
    }
  }, [state, code, router]);

  async function launch() {
    setError("");
    setBusy(true);
    const { ok, status, data } = await apiPost(`/api/host/${code}/start`);
    setBusy(false);
    if (!ok) {
      if (status === 402) {
        setRecharge({ priceAr: data?.priceAr || 0, balanceAr: data?.balanceAr || 0 });
        return;
      }
      setError(data?.error || "Lancement impossible.");
      return;
    }
    router.push(`/host/results?code=${code}`);
  }

  const participants = state?.participants || [];

  if (state?.notFound) {
    return (
      <div className="center-work">
        <div className="card stack gap-16" style={{ textAlign: "center", maxWidth: 440 }}>
          <h2>Salle introuvable</h2>
          <p className="muted">
            Cette salle n'existe plus ou a expiré. Créez un nouveau quiz pour
            obtenir un nouveau code.
          </p>
          <Link href="/host" className="btn btn--primary">Créer un quiz</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="stack gap-24">
      <div className="card stack gap-16" style={{ textAlign: "center" }}>
        <span className="eyebrow">Salle d'attente</span>
        <h1 style={{ fontSize: "2.2rem" }}>Rejoignez avec le code</h1>
        <div
          className="code-tiles"
          role="img"
          aria-label={`Code de la salle : ${code.split("").join(" ")}`}
        >
          {code.split("").map((ch, i) => (
            <span key={i} className="code-tile">
              {ch}
            </span>
          ))}
        </div>
        <p className="muted">
          Les participants apparaissent ci-dessous. Lancez quand tout le monde
          est prêt — les inscriptions seront alors fermées.
        </p>
      </div>

      <div className="stack gap-12">
        <div className="row row--between">
          <span className="eyebrow">
            {participants.length} participant{participants.length > 1 ? "s" : ""}
          </span>
        </div>
        {participants.length === 0 ? (
          <div className="panel" style={{ textAlign: "center" }}>
            <p className="muted">En attente des premiers participants…</p>
          </div>
        ) : (
          <div className="players">
            {participants.map((p) => (
              <span key={p.playerId} className="player-chip">
                <span className="player-chip__dot" />
                {p.pseudo}
              </span>
            ))}
          </div>
        )}
      </div>

      {error && <div className="error" role="alert">{error}</div>}

      <button
        className="btn btn--primary btn--lg btn--block"
        onClick={launch}
        disabled={busy || participants.length === 0}
      >
        {busy ? (
          "Lancement…"
        ) : participants.length === 0 ? (
          "En attente de participants"
        ) : (
          <>
            <Icon name="play" /> Lancer le quiz
          </>
        )}
      </button>

      {recharge && (
        <RechargeModal
          priceAr={recharge.priceAr}
          balanceAr={recharge.balanceAr}
          busyRetry={busy}
          onRetry={() => {
            setRecharge(null);
            launch();
          }}
          onClose={() => setRecharge(null)}
        />
      )}
    </div>
  );
}

export default function HostLobbyPage() {
  return (
    <Suspense fallback={<div className="center-work"><div className="spin" role="status" aria-label="Chargement" /></div>}>
      <LobbyInner />
    </Suspense>
  );
}

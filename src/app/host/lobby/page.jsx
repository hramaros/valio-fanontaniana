"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiGet, apiPost } from "@/lib/api";
import { normalizeCode } from "@/lib/code";
import { usePolling } from "@/lib/usePolling";
import RechargeModal from "@/components/RechargeModal";
import Icon from "@/components/Icon";
import { examPriceAr } from "@/lib/exam";
import { canAfford } from "@/lib/wallet";
import { useAccount } from "@/lib/account-client";

function LobbyInner() {
  const router = useRouter();
  const { account } = useAccount();
  const params = useSearchParams();
  const code = normalizeCode(params.get("code") || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recharge, setRecharge] = useState(null); // { priceAr, balanceAr } | null
  const [libreError, setLibreError] = useState("");

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

  // Repli : bascule la salle en mode Libre (gratuit) puis lance, pour que le
  // cours ait lieu malgré un solde insuffisant. Le serveur refuse la bascule
  // si le quiz contient des réponses libres ou si la salle est trop pleine.
  async function switchLibre() {
    setLibreError("");
    setBusy(true);
    const { ok, data } = await apiPost(`/api/host/${code}/libre`);
    setBusy(false);
    if (!ok) {
      setLibreError(data?.error || "Bascule impossible.");
      return;
    }
    setRecharge(null);
    launch();
  }

  const participants = state?.participants || [];

  // Manque à combler pour lancer l'examen (0 si le solde suffit, ou en Libre).
  const lobbyPriceAr = examPriceAr(state?.mode, state?.capacity);
  const shortfallAr =
    account && lobbyPriceAr > 0 && !canAfford(account.balanceAr, lobbyPriceAr)
      ? lobbyPriceAr - (Number(account.balanceAr) || 0)
      : 0;

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
    <div className="stack gap-16">
      {/* Pré-contrôle : prévenir tant que la classe n'a pas encore rejoint,
          plutôt que de bloquer au lancement avec les élèves devant l'écran. */}
      {shortfallAr > 0 && (
        <div className="error" role="alert">
          <div>
            Il vous manque <span className="money">{shortfallAr} Ar</span> pour
            lancer cet examen. Rechargez avant de démarrer le cours.
          </div>
          <div className="stack gap-8" style={{ marginTop: 10 }}>
            <Link href="/host/wallet" className="btn btn--primary btn--compact">
              <Icon name="creditCard" size={15} /> Recharger maintenant
            </Link>
          </div>
        </div>
      )}

      <div className="card stack gap-12" style={{ textAlign: "center" }}>
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
        <p className="hint" style={{ justifyContent: "center" }}>
          <Icon name="info" size={15} /> Les inscriptions ferment au lancement.
        </p>
      </div>

      <div className="stack gap-8">
        <div className="row row--between">
          <span className="eyebrow row" style={{ gap: 7 }}>
            <Icon name="users" size={14} />
            {participants.length} participant{participants.length > 1 ? "s" : ""}
          </span>
        </div>
        {participants.length === 0 ? (
          <div className="panel">
            <div className="empty-state">
              <span className="empty-state__icon" aria-hidden="true">
                <Icon name="users" size={24} />
              </span>
              <p>En attente des premiers participants…</p>
            </div>
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
          <>
            <Icon name="users" size={16} /> En attente de participants
          </>
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
          libreError={libreError}
          onRetry={() => {
            setRecharge(null);
            launch();
          }}
          onSwitchLibre={switchLibre}
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

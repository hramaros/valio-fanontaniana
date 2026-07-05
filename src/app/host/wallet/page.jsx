"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiGet, apiPost } from "@/lib/api";
import { useAccount } from "@/lib/account-client";

const PRESETS = [5000, 20000, 50000];
const MIN_AR = 500;

const STATUS_LABEL = {
  completed: "Confirmée",
  pending: "En attente",
  failed: "Échouée",
};

function frDate(ts) {
  return ts
    ? new Date(ts).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })
    : "";
}

function WalletInner() {
  const params = useSearchParams();
  const checkout = params.get("checkout"); // "success" | "cancel" | null
  const { account, loading, refresh } = useAccount();
  const [amount, setAmount] = useState(5000);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState(null);
  const [pendingConfirm, setPendingConfirm] = useState(false);

  async function loadHistory() {
    const { ok, data } = await apiGet("/api/wallet/history");
    if (ok) setHistory(data.transactions || []);
  }

  useEffect(() => {
    if (account) loadHistory();
  }, [account]);

  // Retour de Stripe : le webhook peut arriver après la redirection navigateur.
  // On rafraîchit tout de suite puis une seconde fois après ~2 s ; si le solde
  // n'a pas bougé entre-temps, on affiche « confirmation en cours ».
  useEffect(() => {
    if (checkout !== "success") return;
    let cancelled = false;
    (async () => {
      const before = await refresh();
      if (cancelled) return;
      await loadHistory();
      if (cancelled) return;
      await new Promise((r) => setTimeout(r, 2000));
      if (cancelled) return;
      const after = await refresh();
      if (cancelled) return;
      await loadHistory();
      if (!cancelled && before && after && after.balanceAr === before.balanceAr) {
        setPendingConfirm(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checkout, refresh]);

  const selected = custom ? Math.round(Number(custom) || 0) : amount;

  async function recharge() {
    setError("");
    if (selected < MIN_AR) {
      setError(`Montant minimum : ${MIN_AR} Ar.`);
      return;
    }
    setBusy(true);
    const { ok, data } = await apiPost("/api/wallet/topup", { amountAr: selected });
    setBusy(false);
    if (!ok || !data?.redirectUrl) {
      setError(data?.error || "Recharge impossible pour le moment.");
      return;
    }
    window.location.href = data.redirectUrl;
  }

  if (loading) {
    return <div className="center-work"><div className="spin" role="status" aria-label="Chargement" /></div>;
  }

  if (!account) {
    return (
      <div className="center-work">
        <div className="card stack gap-16" style={{ textAlign: "center", maxWidth: 440 }}>
          <h2>Portefeuille</h2>
          <p className="muted">Connectez-vous pour gérer votre solde.</p>
          <Link href="/host" className="btn btn--primary">Créer un quiz</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="stack gap-24">
      <div className="stack gap-8">
        <span className="eyebrow">Votre portefeuille</span>
        <h1 style={{ fontSize: "2rem" }}>
          Solde : <span className="money">{account.balanceAr} Ar</span>
        </h1>
      </div>

      {checkout === "success" && (
        <div className="card card--ok stack gap-8" role="status">
          <strong>Paiement reçu</strong>
          <span className="muted tiny">
            {pendingConfirm
              ? "Confirmation en cours — votre solde sera crédité dans un instant. Actualisez la page si besoin."
              : "Votre solde a été mis à jour."}
          </span>
        </div>
      )}
      {checkout === "cancel" && (
        <div className="panel" role="status">
          <span className="muted">Paiement annulé — aucun montant n'a été débité.</span>
        </div>
      )}

      <div className="card stack gap-16">
        <span className="eyebrow">Recharger</span>
        <div className="row gap-8 wrap">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className={`btn ${!custom && amount === p ? "btn--primary" : "btn--ghost"}`}
              onClick={() => {
                setAmount(p);
                setCustom("");
              }}
            >
              {p.toLocaleString("fr-FR")} Ar
            </button>
          ))}
        </div>
        <div>
          <label className="label" htmlFor="wallet-custom">Autre montant (Ar)</label>
          <input
            id="wallet-custom"
            className="input"
            type="number"
            min={MIN_AR}
            inputMode="numeric"
            placeholder="ex. 10 000"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        <button
          type="button"
          className="btn btn--primary btn--lg btn--block"
          onClick={recharge}
          disabled={busy || selected < MIN_AR}
        >
          {busy
            ? "Redirection…"
            : `Recharger ${selected >= MIN_AR ? selected.toLocaleString("fr-FR") + " Ar" : ""}`}
        </button>
        <p className="tiny muted" style={{ textAlign: "center" }}>
          Paiement sécurisé par carte via Stripe (facturé en euros au taux du jour).
        </p>
      </div>

      <div className="stack gap-12">
        <span className="eyebrow">Historique des recharges</span>
        {history === null ? (
          <div className="spin" role="status" aria-label="Chargement" style={{ margin: "0 auto" }} />
        ) : history.length === 0 ? (
          <div className="panel" style={{ textAlign: "center" }}>
            <p className="muted">Aucune recharge pour l'instant.</p>
          </div>
        ) : (
          <div className="stack gap-8">
            {history.map((t) => (
              <div key={t.id} className="grade-row">
                <div className="grade-row__ans">
                  <div className="money" style={{ fontWeight: 700 }}>{t.amountAr} Ar</div>
                  <div className="muted tiny">{frDate(t.createdAt)}</div>
                </div>
                <span className="pill">{STATUS_LABEL[t.status] || t.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function HostWalletPage() {
  return (
    <Suspense
      fallback={<div className="center-work"><div className="spin" role="status" aria-label="Chargement" /></div>}
    >
      <WalletInner />
    </Suspense>
  );
}

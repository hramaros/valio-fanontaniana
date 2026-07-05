"use client";
import Link from "next/link";
import Modal from "@/components/Modal";

// Popup affiché quand le solde ne couvre pas le lancement de l'examen.
// La recharge réelle se fait sur la page portefeuille (un seul point d'entrée).
export default function RechargeModal({ priceAr, balanceAr, busyRetry, onRetry, onClose }) {
  const enough = (Number(balanceAr) || 0) >= priceAr;

  return (
    <Modal onClose={onClose} labelledBy="recharge-title">
      <div className="stack gap-8" style={{ textAlign: "center" }}>
        <h2 id="recharge-title" style={{ fontSize: "1.4rem" }}>Solde insuffisant</h2>
        <p className="muted">
          Lancer cet examen coûte <strong className="money">{priceAr} Ar</strong>.
          Votre solde est de <strong className="money">{balanceAr} Ar</strong>.
        </p>
      </div>

      <Link href="/host/wallet" className="btn btn--ghost btn--block">
        Recharger mon compte
      </Link>

      <button
        type="button"
        className="btn btn--primary btn--lg btn--block"
        onClick={onRetry}
        disabled={!enough || busyRetry}
      >
        {busyRetry ? "Lancement…" : "Réessayer le lancement"}
      </button>
      <button type="button" className="btn btn--ghost btn--block" onClick={onClose}>
        Annuler
      </button>
    </Modal>
  );
}

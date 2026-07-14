"use client";
import Link from "next/link";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";

// Popup affiché quand le solde ne couvre pas le lancement de l'examen.
// La recharge réelle se fait sur la page portefeuille (un seul point d'entrée).
export default function RechargeModal({ priceAr, balanceAr, busyRetry, onRetry, onClose }) {
  const enough = (Number(balanceAr) || 0) >= priceAr;

  return (
    <Modal onClose={onClose} labelledBy="recharge-title">
      <div className="stack gap-12" style={{ alignItems: "center", textAlign: "center" }}>
        <span className="icon-badge icon-badge--amber" aria-hidden="true">
          <Icon name="wallet" size={19} />
        </span>
        <h2 id="recharge-title" style={{ fontSize: "1.4rem" }}>Solde insuffisant</h2>
      </div>

      <div className="stat-grid" style={{ margin: "16px 0" }}>
        <div className="stat" style={{ padding: 14 }}>
          <div className="stat__num money" style={{ fontSize: "1.5rem" }}>
            {priceAr} Ar
          </div>
          <div className="stat__label">Coût de l'examen</div>
        </div>
        <div className="stat" style={{ padding: 14 }}>
          <div className="stat__num money" style={{ fontSize: "1.5rem" }}>
            {balanceAr} Ar
          </div>
          <div className="stat__label">Votre solde</div>
        </div>
      </div>

      <Link href="/host/wallet" className="btn btn--ghost btn--block">
        <Icon name="creditCard" size={16} /> Recharger mon compte
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

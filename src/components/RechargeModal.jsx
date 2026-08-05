"use client";
import Link from "next/link";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";

// Popup affiché quand le solde ne couvre pas le lancement de l'examen.
// La recharge réelle se fait sur la page portefeuille (un seul point d'entrée).
//
// Ce moment est le pire du parcours : la classe est déjà dans la salle et
// attend. La hiérarchie des actions suit donc ce que le formateur peut
// réellement faire ici — recharger, ou sauver son cours en mode Libre — et
// jamais un bouton désactivé mis en avant.
export default function RechargeModal({
  priceAr,
  balanceAr,
  busyRetry,
  onRetry,
  onClose,
  onSwitchLibre,
  libreError,
}) {
  const enough = (Number(balanceAr) || 0) >= priceAr;
  const shortfallAr = Math.max(0, priceAr - (Number(balanceAr) || 0));

  return (
    <Modal onClose={onClose} labelledBy="recharge-title">
      <div className="stack gap-12" style={{ alignItems: "center", textAlign: "center" }}>
        <span className="icon-badge icon-badge--amber" aria-hidden="true">
          <Icon name="wallet" size={19} />
        </span>
        <h2 id="recharge-title" style={{ fontSize: "1.4rem" }}>
          {enough
            ? "Prêt à lancer"
            : `Il vous manque ${shortfallAr} Ar pour cet examen`}
        </h2>
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

      <p className="hint" style={{ justifyContent: "center" }}>
        <Icon name="shieldCheck" size={14} />
        Débité uniquement si l&apos;examen va au bout.
      </p>

      {libreError && <div className="error" role="alert">{libreError}</div>}

      {enough ? (
        <button
          type="button"
          className="btn btn--primary btn--lg btn--block"
          onClick={onRetry}
          disabled={busyRetry}
        >
          {busyRetry ? "Lancement…" : "Lancer l'examen"}
        </button>
      ) : (
        <>
          <Link href="/host/wallet" className="btn btn--primary btn--lg btn--block">
            <Icon name="creditCard" size={16} /> Recharger — 2 min
          </Link>
          {onSwitchLibre && (
            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={onSwitchLibre}
              disabled={busyRetry}
            >
              <Icon name="play" size={15} /> Lancer en mode Entraînement (gratuit)
            </button>
          )}
        </>
      )}

      <button type="button" className="btn btn--ghost btn--block" onClick={onClose}>
        Annuler
      </button>
    </Modal>
  );
}

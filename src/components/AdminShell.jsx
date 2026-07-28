"use client";
import Link from "next/link";
import Brand from "@/components/Brand";
import Icon from "@/components/Icon";
import EmptyState from "@/components/EmptyState";
import { useAccount } from "@/lib/account-client";

// Enveloppe de l'espace de pilotage. La garde ici est COSMÉTIQUE (masquer le
// contenu) : la vraie barrière est le 403 de /api/admin/*. Séparé de
// HostShell (autre métier), mais mêmes tokens visuels.
export default function AdminShell({ children }) {
  const { account, loading, logout } = useAccount();

  async function handleLogout() {
    await logout();
    window.location.assign("/");
  }

  const isAdmin = account?.role === "admin";

  return (
    <div className="admin-root">
      <header className="shell-header">
        <Brand />
        <span className="shell-tag admin-tag">Pilotage</span>
        <div className="shell-account">
          <Link href="/host" className="btn btn--ghost btn--compact">
            <Icon name="chevronLeft" size={15} /> Espace formateur
          </Link>
          {isAdmin && (
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              onClick={handleLogout}
              aria-label="Se déconnecter"
              title="Se déconnecter"
            >
              <Icon name="logout" size={17} />
            </button>
          )}
        </div>
      </header>

      <main className="container" style={{ maxWidth: 1160 }}>
        {loading ? (
          <div className="center-work">
            <div className="spin" role="status" aria-label="Chargement" />
          </div>
        ) : isAdmin ? (
          children
        ) : (
          <div className="card" style={{ maxWidth: 460, margin: "48px auto" }}>
            <EmptyState icon="lock" title="Accès réservé">
              <p>Cet espace est réservé à l'équipe de pilotage.</p>
              <Link href="/host" className="btn btn--primary">
                Aller à l'espace formateur
              </Link>
            </EmptyState>
          </div>
        )}
      </main>

      <footer className="shell-footer">
        <span className="shell-footer__tagline">
          valio.fanontaniana — tour de contrôle
        </span>
      </footer>
    </div>
  );
}

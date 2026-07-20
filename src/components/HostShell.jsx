"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Brand from "@/components/Brand";
import Icon from "@/components/Icon";
import AuthModal from "@/components/AuthModal";
import { useAccount } from "@/lib/account-client";

const NAV = [
  { href: "/host", label: "Créer un quiz", icon: "plus", exact: true },
  { href: "/host/dashboard", label: "Tableau de bord", icon: "chart" },
  { href: "/host/classes", label: "Mes classes", icon: "users" },
  { href: "/host/history", label: "Mes examens", icon: "clock" },
  { href: "/host/wallet", label: "Portefeuille", icon: "wallet" },
];

// Shell de l'espace formateur : header sticky, navigation latérale
// (barre horizontale sous 1024px), espace de travail, footer.
// `focus` (lobby, suivi de session) masque la nav pour la projection.
export default function HostShell({ focus = false, children }) {
  const pathname = usePathname();
  const { account, loading, logout } = useAccount();
  const [showAuth, setShowAuth] = useState(false);

  async function handleLogout() {
    await logout();
    // Recharge complète : chaque page a son propre état de compte.
    window.location.assign("/host");
  }

  return (
    <div className={`shell${focus ? " shell--focus" : ""}`}>
      <header className="shell-header">
        <Brand />
        <span className="shell-tag">Espace formateur</span>
        <div className="shell-account">
          {loading ? null : account ? (
            <>
              <div className="shell-account__id">
                <div className="tiny" style={{ fontWeight: 600 }}>
                  {account.email}
                </div>
                <div className="tiny money">Solde : {account.balanceAr} Ar</div>
              </div>
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                onClick={handleLogout}
                aria-label="Se déconnecter"
                title="Se déconnecter"
              >
                <Icon name="logout" size={17} />
              </button>
            </>
          ) : (
            <>
              <span className="tiny muted shell-guest">Mode invité</span>
              <button
                type="button"
                className="btn btn--primary btn--compact"
                onClick={() => setShowAuth(true)}
              >
                Se connecter
              </button>
            </>
          )}
        </div>
      </header>

      {!focus && (
        <nav className="shell-nav" aria-label="Navigation formateur" data-tour="nav">
          <div className="shell-nav__inner">
            {NAV.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  data-tour={`nav-${item.href.replace(/^\//, "").replace(/\//g, "-")}`}
                >
                  <Icon name={item.icon} size={17} /> {item.label}
                </Link>
              );
            })}
            <div className="shell-nav__sep" aria-hidden="true" />
            {/* La visite n'est plus une page mais un overlay joué sur /host :
                pas d'aria-current, il n'y a plus de page correspondante. */}
            <Link href="/host?tour=1">
              <Icon name="help" size={17} /> Visite guidée
            </Link>
          </div>
        </nav>
      )}

      <main className="shell-main">{children}</main>

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onAuthed={() => {
            // Recharge complète : chaque page a son propre état de compte.
            window.location.reload();
          }}
        />
      )}

      <footer className="shell-footer">
        <span className="shell-footer__tagline">
          valio.fanontaniana — quiz en direct, avec une vraie note /20.
        </span>
        <span className="row gap-16 wrap">
          <Link href="/">Accès participant</Link>
          <Link href="/verifier">Consultation publique</Link>
          <Link href="/host?tour=1">Aide &amp; visite guidée</Link>
        </span>
      </footer>
    </div>
  );
}

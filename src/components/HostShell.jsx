"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Brand from "@/components/Brand";
import Icon from "@/components/Icon";
import AuthModal from "@/components/AuthModal";
import { useAccount } from "@/lib/account-client";
import { MENU_SET_EVENT } from "@/lib/onboarding";

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
  // Drawer mobile (sous 1024px). Sur desktop la nav est une colonne fixe et
  // cet état n'a aucun effet.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef(null);
  const navRef = useRef(null);
  // Ne rend le focus au bouton que si c'est l'utilisateur qui a ouvert le
  // menu — la visite guidée l'ouvre aussi, et lui voler le focus la casserait.
  const restoreFocusRef = useRef(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  async function handleLogout() {
    await logout();
    // Recharge complète : chaque page a son propre état de compte.
    window.location.assign("/host");
  }

  // Un changement de page ferme le menu (le clic sur un lien navigue).
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Échap ferme, et le scroll de la page est verrouillé pendant l'ouverture.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeMenu();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus dans le panneau (sans ça la tabulation resterait derrière), mais
    // à la frame suivante : le panneau est encore `visibility: hidden` quand
    // l'effet s'exécute, et focus() est sans effet sur un élément invisible.
    const raf = requestAnimationFrame(() => {
      navRef.current?.querySelector("a")?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (restoreFocusRef.current) {
        restoreFocusRef.current = false;
        menuBtnRef.current?.focus();
      }
    };
  }, [menuOpen, closeMenu]);

  // La visite guidée ouvre le drawer pour son étape « nav » (cf. HostTour).
  useEffect(() => {
    const onSet = (e) => setMenuOpen(!!e.detail?.open);
    window.addEventListener(MENU_SET_EVENT, onSet);
    return () => window.removeEventListener(MENU_SET_EVENT, onSet);
  }, []);

  return (
    <div className={`shell${focus ? " shell--focus" : ""}`}>
      <header className="shell-header">
        {!focus && (
          <button
            type="button"
            ref={menuBtnRef}
            className="btn btn--ghost btn--icon shell-menu-btn"
            aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={menuOpen}
            aria-controls="shell-nav"
            onClick={() => {
              restoreFocusRef.current = true;
              setMenuOpen((o) => !o);
            }}
          >
            <Icon name={menuOpen ? "close" : "menu"} size={19} />
          </button>
        )}
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

      {!focus && menuOpen && (
        <div
          className="shell-nav-backdrop"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      {!focus && (
        <nav
          id="shell-nav"
          ref={navRef}
          className={`shell-nav${menuOpen ? " shell-nav--open" : ""}`}
          aria-label="Navigation formateur"
          data-tour="nav"
        >
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
                  // Fermeture explicite : rester sur la même route (ou y
                  // revenir) ne déclenche pas l'effet sur `pathname`.
                  onClick={closeMenu}
                >
                  <Icon name={item.icon} size={17} /> {item.label}
                </Link>
              );
            })}
            <div className="shell-nav__sep" aria-hidden="true" />
            {/* La visite n'est plus une page mais un overlay joué sur /host :
                pas d'aria-current, il n'y a plus de page correspondante. */}
            <Link href="/host?tour=1" onClick={closeMenu}>
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

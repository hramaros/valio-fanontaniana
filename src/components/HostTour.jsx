"use client";
import { useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import {
  isTourDone,
  markTourDone,
  MENU_SET_EVENT,
  TOUR_START_EVENT,
} from "@/lib/onboarding";

// Visite guidée de l'espace formateur : des bulles ancrées sur les vrais
// éléments de l'écran de création. Se déclenche seule au premier passage
// (invités compris), se rejoue via ?tour=1 ou l'évènement valio:tour:start.

const NAV_SELECTOR = '[data-tour="nav"]';

// Le script complet. Les étapes dont la cible n'existe pas sont retirées au
// démarrage (capacité et classe n'apparaissent qu'en mode Examen).
const SCRIPT = [
  {
    popover: {
      title: "Bienvenue dans valio",
      description:
        "Trente secondes pour créer votre premier quiz. Vous pouvez quitter à tout moment.",
      nextBtnText: "C'est parti",
      // Pas de « Retour » grisé sur la première étape.
      showButtons: ["next", "close"],
    },
  },
  {
    element: '[data-tour="host-name"]',
    popover: {
      title: "Votre nom",
      description:
        "Il s'affiche à l'écran des participants. Rien d'autre à remplir pour commencer.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="duration"]',
    popover: {
      title: "Un seul chrono",
      description:
        "Le temps total du quiz. Chacun répond à son rythme, sans question minutée.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="mode"]',
    popover: {
      title: "Libre ou Examen",
      description:
        "Le seul vrai choix à faire. Libre pour tester, Examen pour noter.",
      side: "right",
      align: "center",
    },
  },
  {
    element: '[data-tour="mode-libre"]',
    popover: {
      title: "Libre — gratuit",
      description:
        "QCM, jusqu'à 10 participants, sans compte. Idéal pour essayer tout de suite.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="mode-examen"]',
    popover: {
      title: "Examen — 1 000 Ar",
      description:
        "Note sur 20, réponse libre, export PDF, historique. 1 000 Ar jusqu'à 20 participants, 2 000 Ar illimité. Débité en fin de session.",
      side: "bottom",
      align: "end",
    },
  },
  {
    element: '[data-tour="capacity"]',
    popover: {
      title: "Combien de participants",
      description:
        "Choisissez avant de lancer. Le montant est prélevé une seule fois, à la fin.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="class-select"]',
    popover: {
      title: "Rattacher à une classe",
      description:
        "Chacun choisit son nom dans la liste. Les notes vont directement au carnet.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="submit"]',
    popover: {
      title: "Créez la salle",
      description:
        "Vous obtenez un code à projeter. Vous écrirez les questions juste après.",
      side: "top",
      align: "center",
    },
  },
  {
    element: NAV_SELECTOR,
    popover: {
      title: "Tout le reste est ici",
      description:
        "Vos classes, vos examens passés, votre portefeuille. Et cette visite, à relancer quand vous voulez.",
      side: "right",
      align: "start",
    },
  },
  {
    popover: {
      title: "À vous de jouer",
      description: "Commencez par votre nom, puis créez la salle.",
      doneBtnText: "Terminer",
    },
  },
];

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// Sous 1024px la nav vit dans un drawer refermé : l'étape « nav » l'ouvre le
// temps de la montrer, puis le referme.
function isNarrow() {
  try {
    return window.matchMedia("(max-width: 1023px)").matches;
  } catch {
    return false;
  }
}

function setMenu(open) {
  window.dispatchEvent(new CustomEvent(MENU_SET_EVENT, { detail: { open } }));
}

export default function HostTour() {
  const driverRef = useRef(null);
  const refreshTimerRef = useRef(0);
  const router = useRouter();
  const tourParam = useSearchParams().get("tour");

  const start = useCallback(() => {
    if (driverRef.current?.isActive()) return;

    // Filtré ici (et non au rendu) : le DOM est garanti présent. Sans ça,
    // driver.js pose une bulle détachée au centre de l'écran sur une cible
    // introuvable, au lieu de sauter l'étape.
    const narrow = isNarrow();
    const steps = SCRIPT.filter(
      (s) => !s.element || document.querySelector(s.element),
    ).map((s) => {
      if (s.element !== NAV_SELECTOR || !narrow) return s;
      // Mobile : la nav est dans un drawer fermé. On l'ouvre le temps de
      // l'étape, on repositionne la bulle une fois le panneau arrivé (il
      // glisse en 220ms, driver mesure trop tôt sans ça), et on referme en
      // sortant — quel que soit le sens de sortie.
      return {
        ...s,
        popover: { ...s.popover, side: "bottom", align: "start" },
        onHighlightStarted: () => {
          setMenu(true);
          window.clearTimeout(refreshTimerRef.current);
          refreshTimerRef.current = window.setTimeout(() => {
            driverRef.current?.refresh();
          }, 260);
        },
        onDeselected: () => {
          window.clearTimeout(refreshTimerRef.current);
          setMenu(false);
        },
      };
    });
    if (steps.length === 0) return;

    const reduce = prefersReducedMotion();
    const instance = driver({
      steps,
      popoverClass: "valio-tour",
      // Le fondu CSS est déjà coupé par le garde-fou global de globals.css,
      // mais la transition de scène et le scroll sont pilotés en JS.
      animate: !reduce,
      smoothScroll: !reduce,
      overlayColor: "#0f1a14",
      overlayOpacity: 0.72,
      stagePadding: 6,
      stageRadius: 12,
      // Lecture guidée : sans ça, cliquer « Examen » sans compte ouvrirait
      // AuthModal (z-index 50) sous l'overlay, et changer de mode en cours
      // de route désynchroniserait le jeu d'étapes filtré.
      disableActiveInteraction: true,
      skipMissingElement: true,
      showProgress: true,
      progressText: "{{current}} sur {{total}}",
      nextBtnText: "Suivant",
      prevBtnText: "Retour",
      doneBtnText: "Terminer",
      // onDestroyed et non onDoneClick : quitter par Échap ou la croix doit
      // aussi compter, sinon la visite se relance à chaque passage sur /host.
      onDestroyed: () => {
        markTourDone();
        driverRef.current = null;
        // Quitter pendant l'étape « nav » ne déclenche pas onDeselected :
        // sans ça, le drawer resterait ouvert après la fin de la visite.
        window.clearTimeout(refreshTimerRef.current);
        if (narrow) setMenu(false);
      },
    });

    driverRef.current = instance;
    instance.drive();
  }, []);

  // Démarrage : automatique au premier passage, forcé par ?tour=1.
  //
  // On dépend du paramètre lu par le routeur, pas de window.location au
  // montage : cliquer « Visite guidée » depuis /host est une navigation
  // douce sur la MÊME route, qui ne remonte pas la page — un effet de
  // montage ne la verrait jamais et la visite ne se relançait pas.
  useEffect(() => {
    const forced = tourParam === "1";
    if (!forced && isTourDone()) return;

    // Deux frames : useAccount refait un GET /api/auth/me à chaque montage
    // sans cache, et HostShell comme HostPage le montent — le bloc compte du
    // header change de taille après la réponse. Sans l'attente, la bulle de
    // la nav serait positionnée sur un layout qui va bouger.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        start();
        // Nettoyage après démarrage, et via le routeur plutôt que
        // history.replaceState : l'état interne de Next reste synchrone,
        // sinon un second clic sur le même lien ne serait pas vu comme un
        // changement de paramètre et ne relancerait rien.
        if (forced) router.replace("/host", { scroll: false });
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [tourParam, start, router]);

  // Relance depuis l'aside « Premiers pas » (déjà sur /host : pas de
  // navigation ni de remount).
  useEffect(() => {
    window.addEventListener(TOUR_START_EVENT, start);
    return () => window.removeEventListener(TOUR_START_EVENT, start);
  }, [start]);

  // Sans ça, quitter /host en pleine visite laisse l'overlay SVG orphelin.
  useEffect(
    () => () => {
      window.clearTimeout(refreshTimerRef.current);
      if (driverRef.current?.isActive()) driverRef.current.destroy();
    },
    [],
  );

  return null;
}

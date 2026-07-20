"use client";
// État de la visite guidée du formateur. Volontairement en localStorage (et
// non en sessionStorage comme session.js) : la visite ne doit revenir ni au
// prochain onglet, ni au prochain jour. Volontairement côté client (et non
// sur le compte) : le mode invité est un cas de premier ordre, et c'est lui
// qui a le plus besoin de la visite.

const TOUR_KEY = "valio:tour:host";

// Relance de la visite sans navigation. Déclaré ici et non dans HostTour :
// l'importer depuis le composant tirerait driver.js dans le bundle et
// annulerait son chargement paresseux.
export const TOUR_START_EVENT = "valio:tour:start";

// Pilotage du drawer mobile par la visite (étape « nav ») : le composant de
// la visite et le shell sont frères, ils communiquent par évènement plutôt
// que par un état remonté pour ce seul besoin.
// detail: { open: boolean }
export const MENU_SET_EVENT = "valio:menu:set";

// On stocke la version, pas un booléen : incrémenter fait rejouer la visite
// à tout le monde quand les étapes changent.
// v2 : barre de progression (remplace le texte « X sur Y »), fusion des
// 3 étapes du mode en une seule, clôture reformulée.
export const TOUR_VERSION = 2;

export function getTourState() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(TOUR_KEY) || "null");
  } catch {
    return null;
  }
}

export function isTourDone() {
  const state = getTourState();
  return !!state && state.v === TOUR_VERSION;
}

export function markTourDone() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      TOUR_KEY,
      JSON.stringify({ v: TOUR_VERSION, doneAt: Date.now() }),
    );
  } catch {
    // Safari en navigation privée lève sur setItem : la visite se rejouera,
    // ce n'est pas une raison de casser la page.
  }
}

export function resetTour() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(TOUR_KEY);
  } catch {}
}

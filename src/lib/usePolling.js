"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Interroge `fetcher` tant que `active` est vrai.
 *
 * Deux économies au-delà de la simple cadence (voir `polling.js` pour le
 * chiffrage) :
 *
 * 1. **Onglet caché** → aucune requête. Un élève qui met son navigateur en
 *    arrière-plan, ou un onglet projeté laissé ouvert, ne coûtait rien de
 *    moins qu'un onglet actif. Au retour, on rafraîchit immédiatement.
 * 2. **Backoff optionnel** → on ralentit tant que rien ne change.
 *
 * Le backoff exige une `signature` : la charge utile de `/state` contient
 * `serverNow: Date.now()`, donc une comparaison de l'objet entier verrait
 * toujours un changement et le backoff ne s'enclencherait jamais. L'appelant
 * extrait lui-même ce qui compte (statut, nombre de participants…).
 *
 * @param {object}   [options]
 * @param {number}   [options.backoffMs] plafond de ralentissement ; 0 = désactivé
 * @param {Function} [options.signature] (data) => valeur comparable
 */
export function usePolling(fetcher, intervalMs = 1200, active = true, options = {}) {
  const { backoffMs = 0, signature } = options;
  const [data, setData] = useState(null);

  // Gardés en ref : on ne veut pas relancer la boucle à chaque rendu parce
  // qu'une closure a changé d'identité.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const signatureRef = useRef(signature);
  signatureRef.current = signature;

  useEffect(() => {
    if (!active) return;

    let alive = true;
    let timer = null;
    let delay = intervalMs;
    let lastSignature;

    // Toujours purger le timer en cours avant d'en poser un : un retour
    // d'onglet pendant une requête en vol pourrait sinon laisser deux
    // boucles tourner en parallèle — et doubler la charge au lieu de la
    // réduire.
    const schedule = () => {
      if (!alive) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(tick, delay);
    };

    const tick = async () => {
      if (!alive) return;
      if (document.hidden) {
        schedule();
        return;
      }
      try {
        const next = await fetcherRef.current();
        if (!alive) return;
        if (next !== undefined) {
          setData(next);
          const sign = signatureRef.current;
          if (backoffMs > intervalMs && sign) {
            const current = sign(next);
            if (lastSignature !== undefined && current === lastSignature) {
              delay = Math.min(Math.round(delay * 1.5), backoffMs);
            } else {
              delay = intervalMs;
            }
            lastSignature = current;
          }
        }
      } catch {
        /* erreurs réseau transitoires ignorées */
      }
      schedule();
    };

    tick();

    // Retour sur l'onglet : on rafraîchit sans attendre le tick programmé et
    // on repart à la cadence de base.
    const onVisibilityChange = () => {
      if (document.hidden) return;
      delay = intervalMs;
      tick();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [active, intervalMs, backoffMs]);

  return data;
}

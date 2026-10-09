"use client";
import { useEffect, useState } from "react";

/**
 * Attente avant l'ouverture d'un examen programmé.
 *
 * Distinct de `Countdown`, qui est l'anneau du chrono d'épreuve : celui-ci
 * peut avoir à patienter trois jours, et « 4320:00 » ne veut rien dire. On
 * change donc d'unité selon l'échéance, et on ne passe à la seconde que dans
 * la dernière minute — au-delà, un défilement de secondes ne renseigne
 * personne et donne l'impression d'un examen imminent.
 *
 * `serverOffset` = serverNow - clientNow : l'horloge d'un téléphone de salle
 * de classe est rarement juste, et c'est l'heure du serveur qui décide.
 */
export default function ScheduleCountdown({ startsAt, serverOffset = 0, onDue }) {
  const [now, setNow] = useState(() => Date.now() + serverOffset);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + serverOffset), 1000);
    return () => clearInterval(id);
  }, [serverOffset]);

  const reste = Math.max(0, startsAt - now);

  useEffect(() => {
    if (reste <= 0 && onDue) onDue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reste <= 0]);

  return (
    <div className="stack gap-8" style={{ textAlign: "center" }}>
      <span className="eyebrow">Ouverture</span>
      <div style={{ fontSize: "2.2rem", fontWeight: 800, lineHeight: 1.1 }}>
        {libelle(reste)}
      </div>
      <span className="muted tiny">{heureLocale(startsAt)}</span>
    </div>
  );
}

/** Délai en clair, dans l'unité qui informe vraiment. */
export function libelle(ms) {
  if (ms <= 0) return "maintenant";
  const sec = Math.ceil(ms / 1000);
  if (sec < 60) return `dans ${sec} s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `dans ${min} min`;
  const heures = Math.floor(min / 60);
  const resteMin = min % 60;
  if (heures < 24) {
    return resteMin ? `dans ${heures} h ${String(resteMin).padStart(2, "0")}` : `dans ${heures} h`;
  }
  const jours = Math.round(heures / 24);
  return jours === 1 ? "demain" : `dans ${jours} jours`;
}

/** Date et heure lisibles, dans le fuseau du participant. */
export function heureLocale(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

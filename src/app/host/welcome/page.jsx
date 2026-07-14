"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

const STEPS = [
  {
    icon: "zap",
    title: "Le quiz live qui donne une vraie note",
    lines: [
      "Des quiz en direct qui produisent une note /20 exploitable.",
      "Libre : gratuit, QCM, ≤ 10 participants, sans compte. Examen : pro.",
    ],
  },
  {
    icon: "wallet",
    title: "Le mode Examen & les crédits",
    lines: [
      "Un solde en Ariary : 1 000 Ar (≤ 20 participants) ou 2 000 Ar (illimité), débité en fin de session.",
      "L'Examen débloque réponse libre, export PDF, historique et tableau de bord.",
    ],
  },
  {
    icon: "graduationCap",
    title: "Classes & carnet de notes",
    lines: [
      "Une classe = examens nominatifs (chacun choisit son nom) et note /20 de chaque élève au carnet.",
    ],
  },
];

export default function WelcomePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;

  function done(href = "/host") {
    router.push(href);
  }

  const s = STEPS[step];

  return (
    <div className="stack gap-24" style={{ maxWidth: 640, margin: "0 auto" }}>
      <div className="stack gap-8">
        <span className="eyebrow">Visite guidée · 30 secondes</span>
        <h1 style={{ fontSize: "2rem" }}>Bien démarrer avec valio</h1>
      </div>

      <div className="card stack gap-16">
        <div className="row row--between">
          <span className="empty-state__icon" aria-hidden="true">
            <Icon name={s.icon} size={22} />
          </span>
          <span className="eyebrow">
            {step + 1} / {STEPS.length}
          </span>
        </div>
        <h2 style={{ fontSize: "1.6rem" }}>{s.title}</h2>
        <div className="stack gap-12">
          {s.lines.map((l, i) => (
            <p key={i} className="muted" style={{ margin: 0 }}>{l}</p>
          ))}
        </div>

        <div className="onb-dots" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className={`onb-dot${i === step ? " onb-dot--on" : ""}`} />
          ))}
        </div>

        {last ? (
          <div className="stack gap-8">
            <button
              className="btn btn--primary btn--lg btn--block"
              onClick={() => done("/host")}
            >
              <Icon name="play" size={16} /> Créer mon premier quiz
            </button>
            <button
              className="btn btn--ghost btn--block"
              onClick={() => done("/host/classes")}
            >
              <Icon name="graduationCap" size={16} /> Créer une classe
            </button>
          </div>
        ) : (
          <div className="row gap-12">
            {step > 0 && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setStep((n) => n - 1)}
              >
                Retour
              </button>
            )}
            <button
              type="button"
              className="btn btn--primary btn--block"
              style={{ flex: 1 }}
              onClick={() => setStep((n) => n + 1)}
            >
              Suivant
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { apiGet } from "@/lib/api";
import {
  TimeSeriesChart,
  ProportionBar,
  fmtAr,
  fmtNum,
} from "@/components/charts";

const PERIODS = [
  { days: 7, label: "7 j" },
  { days: 30, label: "30 j" },
  { days: 90, label: "90 j" },
];

function Stat({ icon, tone, value, label, hint }) {
  return (
    <div className="stat" style={{ textAlign: "left" }}>
      <span className={`stat__icon stat__icon--${tone}`} aria-hidden="true"
        style={{ margin: 0 }}>
        <Icon name={icon} size={17} />
      </span>
      <div className="stat__num" style={{ fontSize: "1.7rem", marginTop: 8 }}>{value}</div>
      <div className="stat__label" style={{ textTransform: "none", letterSpacing: 0 }}>{label}</div>
      {hint && <div className="tiny muted" style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

// Définition en clair sous chaque indicateur dérivé : un chiffre de pilotage
// sans sa définition est un contresens en puissance.
function Def({ children }) {
  return (
    <p className="hint" style={{ marginTop: 10 }}>
      <Icon name="info" size={14} /> {children}
    </p>
  );
}

export default function AdminDashboard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    apiGet(`/api/admin/overview?days=${days}`).then(({ ok, data }) => {
      if (cancelled) return;
      if (!ok) setError(data?.error || "Chargement impossible.");
      else setData(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const r = data?.revenu;
  const u = data?.usage;
  const s = data?.stock;
  const c = data?.churn;

  return (
    <div className="stack gap-24" style={{ paddingTop: 24, paddingBottom: 48 }}>
      <div className="row row--between wrap gap-12">
        <div className="stack gap-8">
          <span className="eyebrow row" style={{ gap: 7 }}>
            <Icon name="gauge" size={14} /> Tour de contrôle
          </span>
          <h1 style={{ fontSize: "2rem" }}>Pilotage</h1>
        </div>
        <div className="seg" role="group" aria-label="Période">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
              aria-pressed={days === p.days}
              onClick={() => setDays(p.days)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="error" role="alert">{error}</div>}

      {loading && !data ? (
        <div className="center-work">
          <div className="spin" role="status" aria-label="Chargement" />
        </div>
      ) : data ? (
        <>
          {/* — Chiffres de tête — */}
          <div className="stat-grid">
            <Stat icon="banknote" tone="sky" value={fmtAr(r.encaisseAr)}
              label={`Encaissé (${days} j)`} hint="recharges confirmées" />
            <Stat icon="zap" tone="amber" value={fmtAr(r.consommeAr)}
              label={`Consommé (${days} j)`} hint="examens débités" />
            <Stat icon="wallet" tone="amber" value={fmtAr(s.passifPrepaidAr)}
              label="Passif prépayé" hint="soldes non dépensés" />
            <Stat icon="users" tone="accent" value={fmtNum(s.comptesInscrits)}
              label="Formateurs inscrits" />
            <Stat icon="trendingUp" tone="mint" value={fmtNum(s.actifs30j)}
              label="Actifs (30 j)" hint="connexion ou partie" />
            <Stat icon="target" tone="sky" value={fmtAr(r.arpuPayantAr)}
              label="ARPU" hint={`${fmtNum(r.clientsPayants)} clients payants`} />
          </div>

          {/* — Revenu : encaissé vs consommé (pleine largeur, chiffre phare) — */}
          <div className="card stack gap-12">
            <div className="chart-card__head">
              <span className="eyebrow">Revenu par jour</span>
              <span className="tiny muted">Ariary</span>
            </div>
            <TimeSeriesChart
              height={220}
              format={fmtAr}
              series={[
                { name: "Encaissé", color: "var(--chart-cash-in)", points: r.encaisseSeries },
                { name: "Consommé", color: "var(--chart-cash-used)", points: r.consommeSeries },
              ]}
            />
            <Def>
              Encaissé = argent entré (recharges). Consommé = prépayé utilisé
              (examens débités). Les deux ne coïncident pas dans le temps.
            </Def>
          </div>

          {/* Graphiques appariés (hauteurs proches). */}
          <div className="admin-grid">
            <div className="card stack gap-12">
              <span className="eyebrow">Inscriptions par jour</span>
              <TimeSeriesChart
                series={[{ name: "Inscriptions", color: "var(--accent)", points: u.inscriptionsSeries }]}
              />
            </div>
            <div className="card stack gap-12">
              <span className="eyebrow">Examens par jour</span>
              <TimeSeriesChart
                series={[{ name: "Examens", color: "var(--accent)", points: u.examensSeries }]}
              />
            </div>
          </div>

          {/* Proportions appariées. */}
          <div className="admin-grid">
            <div className="card stack gap-12">
              <div className="chart-card__head">
                <span className="eyebrow">Entonnoir des parties</span>
                <span className="tiny muted">
                  {u.funnel.total ? Math.round(u.funnel.conversion * 100) + " % en Examen" : "—"}
                </span>
              </div>
              <ProportionBar
                segments={[
                  { label: "Entraînement (gratuit)", value: u.funnel.libre, muted: true },
                  { label: "Examen (payant)", value: u.funnel.examen, color: "var(--accent)" },
                ]}
              />
              <Def>
                Part des parties lancées en mode payant. Seul indicateur qui voit
                le mode gratuit.
              </Def>
            </div>

            <div className="card stack gap-16">
              <div className="stack gap-8">
                <span className="eyebrow">Capacité des examens</span>
                <ProportionBar
                  segments={[
                    { label: "≤ 20 · 1 000 Ar", value: u.capacityMix.small, color: "var(--accent)" },
                    { label: "Illimité · 2 000 Ar", value: u.capacityMix.unlimited, muted: true },
                  ]}
                />
              </div>
              <div className="stack gap-8">
                <span className="eyebrow">Mode d'inscription</span>
                <ProportionBar
                  segments={[
                    { label: "Email + mot de passe", value: s.providerMix.password, color: "var(--accent)" },
                    { label: "Google", value: s.providerMix.google, muted: true },
                  ]}
                />
              </div>
            </div>
          </div>

          {/* — Churn & usage — */}
          <div className="stat-grid">
            <Stat icon="chart" tone="accent" value={fmtNum(u.examens)}
              label={`Examens (${days} j)`} />
            <Stat icon="users" tone="sky" value={fmtNum(u.participants)}
              label="Participants cumulés" />
            <Stat icon="target" tone="mint" value={u.noteMoyenne}
              label="Note moyenne / 20" />
            <Stat icon="alertTriangle" tone="coral"
              value={c.actifsAvant ? Math.round(c.taux * 100) + " %" : "—"}
              label="Churn d'usage"
              hint={`${fmtNum(c.perdus)} perdus / ${fmtNum(c.actifsAvant)} actifs`} />
          </div>
          <Def>
            Churn d'usage : formateurs ayant lancé un examen la période
            précédente, mais aucun sur la période courante. Sur du prépayé,
            l'inactivité est le seul signal de perte.
          </Def>
        </>
      ) : null}
    </div>
  );
}

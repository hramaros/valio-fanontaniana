"use client";
import { useRef, useState } from "react";

// Graphiques SVG écrits à la main — zéro dépendance (principe « léger par
// défaut »). Registre sobre de l'espace admin.
//
// Note technique : var(--token) n'est PAS résolu dans un ATTRIBUT SVG
// (stroke="var(...)") — seulement dans `style`. Les couleurs de série passent
// donc par `style` ; les couleurs fixes (grille, crosshair) par des classes.

const nf = new Intl.NumberFormat("fr-FR");
export const fmtAr = (n) => `${nf.format(Math.round(Number(n) || 0))} Ar`;
export const fmtNum = (n) => nf.format(Math.round(Number(n) || 0));

const ddmm = (day) => {
  const [, m, d] = String(day).split("-");
  return `${d}/${m}`;
};

// Repère du tracé, en unités de viewBox (le SVG est mis à l'échelle en CSS).
const W = 600;
const H = 200;
const PAD = { l: 6, r: 6, t: 12, b: 20 };
const plotW = W - PAD.l - PAD.r;
const plotH = H - PAD.t - PAD.b;

/**
 * Série(s) temporelle(s). 1 série → aire remplie ; 2 séries → deux lignes
 * (même axe, même unité — jamais de double axe). Survol : trait vertical +
 * infobulle sur le point le plus proche.
 *
 * series: [{ name, color, points: [{ day, value }] }]  (color = chaîne CSS)
 */
export function TimeSeriesChart({ series, format = fmtNum, height = 200 }) {
  const wrapRef = useRef(null);
  const [idx, setIdx] = useState(null);

  const days = series[0]?.points?.map((p) => p.day) || [];
  const n = days.length;
  const maxY = Math.max(
    1,
    ...series.flatMap((s) => s.points.map((p) => Number(p.value) || 0)),
  );
  const total = series.reduce(
    (s, serie) => s + serie.points.reduce((a, p) => a + (Number(p.value) || 0), 0),
    0,
  );

  if (n === 0 || total === 0) {
    return <div className="chart-empty">Aucune donnée sur la période.</div>;
  }

  const x = (i) => PAD.l + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v) => PAD.t + plotH - ((Number(v) || 0) / maxY) * plotH;
  const single = series.length === 1;

  function onMove(e) {
    const rect = wrapRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setIdx(Math.round(ratio * (n - 1)));
  }

  const tickCount = Math.min(5, n);
  const ticks = Array.from({ length: tickCount }, (_, k) =>
    Math.round((k / Math.max(1, tickCount - 1)) * (n - 1)),
  );

  const active = idx;
  const rect = wrapRef.current?.getBoundingClientRect();
  const tipLeft = active != null && rect ? (x(active) / W) * rect.width : 0;
  const tipTop =
    active != null && rect
      ? (Math.min(...series.map((s) => y(s.points[active].value))) / H) * rect.height
      : 0;

  return (
    <div
      className="chart"
      ref={wrapRef}
      onMouseMove={onMove}
      onMouseLeave={() => setIdx(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Graphique temporel" style={{ height }}>
        <line className="chart-grid-line" x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} />
        <line className="chart-grid-line" x1={PAD.l} x2={W - PAD.r} y1={y(maxY / 2)} y2={y(maxY / 2)} />

        {series.map((s) => {
          const line = s.points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
          const area = `${line} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`;
          return (
            <g key={s.name}>
              {single && <path d={area} style={{ fill: s.color, fillOpacity: 0.14 }} />}
              <path
                d={line}
                fill="none"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                style={{ stroke: s.color }}
              />
            </g>
          );
        })}

        {ticks.map((i) => (
          <text
            key={i}
            className="chart-axis"
            x={x(i)}
            y={H - 6}
            textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
          >
            {ddmm(days[i])}
          </text>
        ))}
        <text className="chart-axis" x={PAD.l} y={PAD.t - 3}>{format(maxY)}</text>

        {active != null && (
          <g>
            <line className="chart-crosshair" x1={x(active)} x2={x(active)} y1={PAD.t} y2={y(0)} />
            {series.map((s) => (
              <circle
                key={s.name}
                className="chart-dot"
                cx={x(active)}
                cy={y(s.points[active].value)}
                r="3.5"
                style={{ fill: s.color }}
              />
            ))}
          </g>
        )}
      </svg>

      {active != null && rect && (
        <div className="chart-tip" style={{ left: tipLeft, top: tipTop - 8 }}>
          <div className="chart-tip__day">{ddmm(days[active])}</div>
          {series.map((s) => (
            <div className="chart-tip__row" key={s.name}>
              <i style={{ background: s.color }} />
              {s.name} : {format(s.points[active].value)}
            </div>
          ))}
        </div>
      )}

      {series.length > 1 && (
        <div className="chart-legend">
          {series.map((s) => (
            <span key={s.name}>
              <i style={{ background: s.color }} /> {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Barre de proportion horizontale. Chaque segment porte son libellé + valeur
 * en clair : l'identité ne repose jamais sur la couleur seule.
 * segments: [{ label, value, color?, muted? }]
 */
export function ProportionBar({ segments, format = fmtNum }) {
  const total = segments.reduce((s, x) => s + (Number(x.value) || 0), 0);
  if (total === 0) {
    return <div className="chart-empty">Aucune donnée sur la période.</div>;
  }
  return (
    <div>
      <div
        className="proportion"
        role="img"
        aria-label={segments.map((s) => `${s.label} : ${format(s.value)}`).join(", ")}
      >
        {segments.map((s) =>
          s.value > 0 ? (
            <div
              key={s.label}
              className={`proportion__seg${s.muted ? " proportion__seg--muted" : ""}`}
              style={{
                flexBasis: `${(s.value / total) * 100}%`,
                background: s.muted ? undefined : s.color,
              }}
              title={`${s.label} : ${format(s.value)}`}
            >
              {s.value / total >= 0.12 ? Math.round((s.value / total) * 100) + " %" : ""}
            </div>
          ) : null,
        )}
      </div>
      <div className="proportion-legend">
        {segments.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.muted ? "var(--surface-2)" : s.color }} />
            {s.label} · <strong style={{ color: "var(--text)" }}>{format(s.value)}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

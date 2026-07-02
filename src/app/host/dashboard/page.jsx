"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Brand from "@/components/Brand";
import { apiGet } from "@/lib/api";
import { useAccount } from "@/lib/account-client";

function frDate(ts) {
  return ts
    ? new Date(ts).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })
    : "";
}

export default function HostDashboardPage() {
  const { account, loading } = useAccount();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!account) return;
    (async () => {
      const { ok, data } = await apiGet("/api/host/analytics");
      if (ok) setData(data);
    })();
  }, [account]);

  if (loading) {
    return <div className="center-screen"><div className="spin" role="status" aria-label="Chargement" /></div>;
  }

  if (!account) {
    return (
      <div className="center-screen">
        <div className="card stack gap-16" style={{ textAlign: "center" }}>
          <h2>Tableau de bord</h2>
          <p className="muted">Connectez-vous pour voir vos statistiques.</p>
          <Link href="/host" className="btn btn--primary">Espace formateur</Link>
        </div>
      </div>
    );
  }

  const stats = data?.stats;

  return (
    <div className="container stack gap-24">
      <div className="row row--between wrap gap-12">
        <Brand />
        <Link href="/host" className="pill">← Espace formateur</Link>
      </div>

      <div className="stack gap-8">
        <span className="eyebrow">{account.email} · Solde {account.balanceAr} Ar</span>
        <h1 style={{ fontSize: "2rem" }}>Tableau de bord</h1>
      </div>

      {!data ? (
        <div className="spin" role="status" aria-label="Chargement" style={{ margin: "0 auto" }} />
      ) : stats.examCount === 0 ? (
        <div className="panel" style={{ textAlign: "center" }}>
          <p className="muted">
            Aucune statistique pour l'instant — lancez un examen pour commencer.
          </p>
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat">
              <div className="stat__num">{stats.examCount}</div>
              <div className="stat__label">Examens</div>
            </div>
            <div className="stat">
              <div className="stat__num">{stats.totalParticipants}</div>
              <div className="stat__label">Participants cumulés</div>
            </div>
            <div className="stat">
              <div className="stat__num">{stats.avgNote}</div>
              <div className="stat__label">Note moyenne / 20</div>
            </div>
            <div className="stat">
              <div className="stat__num">{stats.totalSpentAr}</div>
              <div className="stat__label">Dépensé (Ar)</div>
            </div>
          </div>

          {data.recent.length > 0 && (
            <div className="stack gap-12">
              <span className="eyebrow">Examens récents</span>
              <div className="stack gap-8">
                {data.recent.map((r) => (
                  <div key={r.id} className="grade-row">
                    <div className="grade-row__ans">
                      <div style={{ fontWeight: 700 }}>{r.title}</div>
                      <div className="muted tiny">
                        {frDate(r.endedAt)} · {r.participantCount} participant
                        {r.participantCount > 1 ? "s" : ""} · note moy.{" "}
                        {typeof r.avgNote === "number" ? r.avgNote : "—"}/20
                      </div>
                    </div>
                    <span className="pill">{r.priceAr} Ar</span>
                  </div>
                ))}
              </div>
              <Link href="/host/history" className="btn btn--ghost btn--block">
                Voir tout l'historique
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import EmptyState from "@/components/EmptyState";
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
    return <div className="center-work"><div className="spin" role="status" aria-label="Chargement" /></div>;
  }

  if (!account) {
    return (
      <div className="center-work">
        <div className="card" style={{ maxWidth: 440 }}>
          <EmptyState icon="chart" title="Tableau de bord">
            <p>Connectez-vous pour voir vos statistiques.</p>
            <Link href="/host" className="btn btn--primary">Créer un quiz</Link>
          </EmptyState>
        </div>
      </div>
    );
  }

  const stats = data?.stats;

  return (
    <div className="stack gap-24">
      <div className="stack gap-8">
        <span className="eyebrow">Statistiques de vos examens</span>
        <h1 style={{ fontSize: "2rem" }}>Tableau de bord</h1>
      </div>

      {!data ? (
        <div className="spin" role="status" aria-label="Chargement" style={{ margin: "0 auto" }} />
      ) : stats.examCount === 0 ? (
        <div className="panel">
          <EmptyState icon="inbox">
            <p>Lancez un examen pour voir vos statistiques.</p>
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat">
              <span className="stat__icon stat__icon--accent" aria-hidden="true">
                <Icon name="chart" size={17} />
              </span>
              <div className="stat__num">{stats.examCount}</div>
              <div className="stat__label">Examens</div>
            </div>
            <div className="stat">
              <span className="stat__icon stat__icon--sky" aria-hidden="true">
                <Icon name="users" size={17} />
              </span>
              <div className="stat__num">{stats.totalParticipants}</div>
              <div className="stat__label">Participants cumulés</div>
            </div>
            <div className="stat">
              <span className="stat__icon stat__icon--mint" aria-hidden="true">
                <Icon name="target" size={17} />
              </span>
              <div className="stat__num">{stats.avgNote}</div>
              <div className="stat__label">Note moyenne / 20</div>
            </div>
            <div className="stat">
              <span className="stat__icon stat__icon--amber" aria-hidden="true">
                <Icon name="wallet" size={17} />
              </span>
              <div className="stat__num money">{stats.totalSpentAr}</div>
              <div className="stat__label">Dépensé (Ar)</div>
            </div>
          </div>

          {data.recent.length > 0 && (
            <div className="stack gap-12">
              <span className="eyebrow">Examens récents</span>
              <div className="stack gap-8">
                {data.recent.map((r) => (
                  <div key={r.id} className="grade-row">
                    <span className="icon-badge" aria-hidden="true">
                      <Icon name="history" size={17} />
                    </span>
                    <div className="grade-row__ans">
                      <div style={{ fontWeight: 700 }}>{r.title}</div>
                      <div className="muted tiny">
                        {frDate(r.endedAt)} · {r.participantCount} participant
                        {r.participantCount > 1 ? "s" : ""} · note moy.{" "}
                        {typeof r.avgNote === "number" ? r.avgNote : "—"}/20
                      </div>
                    </div>
                    <span className="pill pill--money">{r.priceAr} Ar</span>
                  </div>
                ))}
              </div>
              <Link href="/host/history" className="btn btn--ghost btn--block">
                Voir tout l'historique <Icon name="arrowRight" size={15} />
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}

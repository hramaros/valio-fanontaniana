"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Leaderboard from "@/components/Leaderboard";
import Modal from "@/components/Modal";
import CopyButton from "@/components/CopyButton";
import Icon from "@/components/Icon";
import EmptyState from "@/components/EmptyState";
import { apiGet } from "@/lib/api";
import { useAccount } from "@/lib/account-client";

// Chargé à la demande (jsPDF est lourd).
async function exportPdf(record) {
  const { downloadHostResultsPdf } = await import("@/lib/pdf");
  downloadHostResultsPdf(record);
}

function frDate(ts) {
  return ts
    ? new Date(ts).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })
    : "";
}

export default function HostHistoryPage() {
  const { account, loading } = useAccount();
  const [records, setRecords] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!account) return;
    (async () => {
      const { ok, data } = await apiGet("/api/host/history");
      if (ok) setRecords(data.records);
    })();
  }, [account]);

  async function open(id) {
    const { ok, data } = await apiGet(`/api/host/history/${id}`);
    if (ok) setSelected(data.record);
  }

  if (loading) {
    return <div className="center-work"><div className="spin" role="status" aria-label="Chargement" /></div>;
  }

  if (!account) {
    return (
      <div className="center-work">
        <div className="card" style={{ maxWidth: 440 }}>
          <EmptyState icon="history" title="Mes examens">
            <p>Connectez-vous pour consulter l&apos;historique.</p>
            <Link href="/host" className="btn btn--primary">
              Créer un quiz
            </Link>
          </EmptyState>
        </div>
      </div>
    );
  }

  return (
    <div className="stack gap-24">
      <div className="stack gap-8">
        <span className="eyebrow">Historique, classements &amp; exports PDF</span>
        <h1 style={{ fontSize: "2rem" }}>Mes examens</h1>
      </div>

      {!records ? (
        <div className="spin" role="status" aria-label="Chargement" style={{ margin: "0 auto" }} />
      ) : records.length === 0 ? (
        <div className="panel">
          <EmptyState icon="history">
            <p>
              Vos examens apparaîtront ici — classement, notes /20 et export
              PDF.
            </p>
          </EmptyState>
        </div>
      ) : (
        <div className="stack gap-8">
          {records.map((r) => (
            <div key={r.id} className="grade-row">
              <span className="icon-badge" aria-hidden="true">
                <Icon name="history" size={17} />
              </span>
              <div className="grade-row__ans">
                <div style={{ fontWeight: 700 }}>{r.title}</div>
                <div className="muted tiny">
                  {frDate(r.endedAt)} · {r.participantCount} participant
                  {r.participantCount > 1 ? "s" : ""} · {r.priceAr} Ar
                </div>
              </div>
              {r.verifyCode && (
                <CopyButton value={r.verifyCode} label={r.verifyCode} />
              )}
              <button
                type="button"
                className="btn btn--ghost btn--compact"
                onClick={() => open(r.id)}
              >
                Voir <Icon name="arrowRight" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <Modal
          onClose={() => setSelected(null)}
          labelledBy="history-title"
          maxWidth={560}
        >
          <div className="row row--between">
            <h2 id="history-title" style={{ fontSize: "1.3rem" }}>
              {selected.title}
            </h2>
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              onClick={() => setSelected(null)}
              aria-label="Fermer"
            >
              <Icon name="close" />
            </button>
          </div>
          <span className="tiny muted">
            {frDate(selected.endedAt)} · Salle {selected.code} · {selected.priceAr} Ar
          </span>
          <Leaderboard players={selected.leaderboard} />
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={() => exportPdf(selected)}
          >
            <Icon name="download" /> Télécharger le PDF
          </button>
        </Modal>
      )}
    </div>
  );
}

"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { useAccount } from "@/lib/account-client";
import ConfirmButton from "@/components/ConfirmButton";

export default function HostClassesPage() {
  const { account, loading } = useAccount();
  const [classes, setClasses] = useState(null);
  const [name, setName] = useState("");

  const refreshList = useCallback(async () => {
    const { ok, data } = await apiGet("/api/host/classes");
    if (ok) setClasses(data.classes);
  }, []);

  useEffect(() => {
    if (account) refreshList();
  }, [account, refreshList]);

  async function createCls(e) {
    e.preventDefault();
    if (!name.trim()) return;
    const { ok } = await apiPost("/api/host/classes", { name: name.trim() });
    if (ok) {
      setName("");
      refreshList();
    }
  }

  async function deleteCls(id) {
    const { ok } = await apiDelete(`/api/host/classes/${id}`);
    if (ok) refreshList();
  }

  if (loading) {
    return <div className="center-work"><div className="spin" role="status" aria-label="Chargement" /></div>;
  }

  if (!account) {
    return (
      <div className="center-work">
        <div className="card stack gap-16" style={{ textAlign: "center", maxWidth: 440 }}>
          <h2>Mes classes</h2>
          <p className="muted">Connectez-vous pour gérer vos classes.</p>
          <Link href="/host" className="btn btn--primary">Créer un quiz</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="stack gap-24">
      <div className="stack gap-8">
        <span className="eyebrow">Examens nominatifs &amp; carnet de notes</span>
        <h1 style={{ fontSize: "2rem" }}>Mes classes</h1>
      </div>

      <form className="card row gap-12 wrap" onSubmit={createCls}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 180 }}
          aria-label="Nom de la classe"
          placeholder="Nom de la classe (ex. 6ème A)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
        <button type="submit" className="btn btn--primary">Créer la classe</button>
      </form>

      {!classes ? (
        <div className="spin" role="status" aria-label="Chargement" style={{ margin: "0 auto" }} />
      ) : classes.length === 0 ? (
        <div className="panel" style={{ textAlign: "center" }}>
          <p className="muted">
            Créez votre première classe pour suivre les notes de vos élèves au fil
            des examens.
          </p>
        </div>
      ) : (
        <div className="stack gap-8">
          {classes.map((c) => (
            <div key={c.id} className="grade-row">
              <div className="grade-row__ans">
                <div style={{ fontWeight: 700 }}>{c.name}</div>
                <div className="muted tiny">
                  {c.studentCount} élève{c.studentCount > 1 ? "s" : ""}
                </div>
              </div>
              <div className="row gap-8">
                <Link
                  href={`/host/classes/${c.id}`}
                  className="btn btn--ghost"
                  style={{ padding: "8px 12px" }}
                >
                  Gérer
                </Link>
                <ConfirmButton
                  className="btn btn--danger"
                  style={{ padding: "8px 12px" }}
                  confirmLabel="Confirmer ?"
                  onConfirm={() => deleteCls(c.id)}
                >
                  Supprimer
                </ConfirmButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

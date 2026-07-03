"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { useAccount } from "@/lib/account-client";
import ConfirmButton from "@/components/ConfirmButton";

export default function ClassDetailPage() {
  const { account, loading } = useAccount();
  const { id } = useParams();
  const [classroom, setClassroom] = useState(null);
  const [gradebook, setGradebook] = useState(null);
  const [studentName, setStudentName] = useState("");
  const [notFound, setNotFound] = useState(false);

  const refresh = useCallback(async () => {
    const detail = await apiGet(`/api/host/classes/${id}`);
    if (detail.ok) setClassroom(detail.data.classroom);
    else setNotFound(true);
    const gb = await apiGet(`/api/host/classes/${id}/gradebook`);
    if (gb.ok) setGradebook(gb.data.gradebook);
  }, [id]);

  useEffect(() => {
    if (account) refresh();
  }, [account, refresh]);

  async function addStu(e) {
    e.preventDefault();
    if (!studentName.trim()) return;
    const { ok } = await apiPost(`/api/host/classes/${id}/students`, {
      name: studentName.trim(),
    });
    if (ok) {
      setStudentName("");
      refresh();
    }
  }

  async function removeStu(studentId) {
    const { ok } = await apiDelete(`/api/host/classes/${id}/students`, { studentId });
    if (ok) refresh();
  }

  if (loading) {
    return <div className="center-work"><div className="spin" role="status" aria-label="Chargement" /></div>;
  }

  if (!account) {
    return (
      <div className="center-work">
        <div className="card stack gap-16" style={{ textAlign: "center", maxWidth: 440 }}>
          <h2>Classe</h2>
          <p className="muted">Connectez-vous pour gérer cette classe.</p>
          <Link href="/host" className="btn btn--primary">Créer un quiz</Link>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="center-work">
        <div className="card stack gap-16" style={{ textAlign: "center", maxWidth: 440 }}>
          <h2>Classe introuvable</h2>
          <Link href="/host/classes" className="btn btn--primary">Mes classes</Link>
        </div>
      </div>
    );
  }

  if (!classroom) {
    return <div className="center-work"><div className="spin" role="status" aria-label="Chargement" /></div>;
  }

  const hasExams = gradebook && gradebook.exams.length > 0;

  return (
    <div className="stack gap-24">
      <div className="stack gap-8">
        <Link href="/host/classes" className="tiny" style={{ color: "var(--muted)" }}>
          ← Mes classes
        </Link>
        <h1 style={{ fontSize: "2rem" }}>{classroom.name}</h1>
      </div>

      <div className="stack gap-12">
        <span className="eyebrow">
          Élèves · {classroom.students.length}
        </span>
        <form className="row gap-8 wrap" onSubmit={addStu}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 180 }}
            aria-label="Nom de l'élève"
            placeholder="Nom de l'élève"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            maxLength={60}
          />
          <button type="submit" className="btn btn--primary">Ajouter</button>
        </form>
        {classroom.students.length === 0 ? (
          <div className="panel">
            <p className="muted tiny">
              Ajoutez vos élèves : ils pourront choisir leur nom lors d'un examen
              nominatif, et leurs notes alimenteront le carnet ci-dessous.
            </p>
          </div>
        ) : (
          <div className="stack gap-8">
            {classroom.students.map((s) => (
              <div key={s.id} className="grade-row">
                <div className="grade-row__ans">{s.name}</div>
                <ConfirmButton
                  className="btn btn--ghost btn--compact"
                  confirmLabel="Retirer ?"
                  onConfirm={() => removeStu(s.id)}
                >
                  Retirer
                </ConfirmButton>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="stack gap-12">
        <span className="eyebrow">Carnet de notes</span>
        {!hasExams ? (
          <div className="panel">
            <p className="muted tiny">
              Aucun examen pour cette classe pour l'instant. Lancez un examen en
              choisissant cette classe : chaque élève retrouvera sa note ici.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="gradebook">
              <thead>
                <tr>
                  <th>Élève</th>
                  {gradebook.exams.map((e) => (
                    <th key={e.id}>{e.title}</th>
                  ))}
                  <th>Moy.</th>
                </tr>
              </thead>
              <tbody>
                {gradebook.rows.map((row) => (
                  <tr key={row.studentId}>
                    <td>{row.name}</td>
                    {gradebook.exams.map((e) => (
                      <td key={e.id}>
                        {row.notes[e.id] == null ? "—" : row.notes[e.id]}
                      </td>
                    ))}
                    <td>
                      <strong>{row.avgNote == null ? "—" : row.avgNote}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";
import EmptyState from "@/components/EmptyState";
import CopyButton from "@/components/CopyButton";
import ConfirmButton from "@/components/ConfirmButton";
import { libelle, heureLocale } from "@/components/ScheduleCountdown";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { useAccount } from "@/lib/account-client";
import { deposerImport } from "@/lib/quizImportHandoff";

const MODES = { examen: "Examen", libre: "Libre" };

function dureeCourte(sec) {
  const m = Math.round((Number(sec) || 0) / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
}

/** `datetime-local` → ms. L'entrée est en heure locale du formateur. */
function localToMs(valeur) {
  if (!valeur) return NaN;
  const d = new Date(valeur);
  return Number.isNaN(d.getTime()) ? NaN : d.getTime();
}

/** Valeur `datetime-local` par défaut : demain à 8 h, arrondi à la minute. */
function demainMatin() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function HostQuizPage() {
  const router = useRouter();
  const { account, loading } = useAccount();

  const [quizzes, setQuizzes] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [planning, setPlanning] = useState(null);
  const [classes, setClasses] = useState([]);
  const [erreur, setErreur] = useState("");
  const [busy, setBusy] = useState(false);

  // Import
  const [url, setUrl] = useState("");
  const [importEnCours, setImportEnCours] = useState(false);

  // Programmation
  const [aProgrammer, setAProgrammer] = useState(null);
  const [quand, setQuand] = useState(demainMatin);
  const [classeChoisie, setClasseChoisie] = useState("");
  const [fenetre, setFenetre] = useState(5);
  const [dernierCode, setDernierCode] = useState(null);

  const charger = useCallback(async () => {
    const [biblio, plan, cls] = await Promise.all([
      apiGet("/api/host/quiz"),
      apiGet("/api/host/scheduled"),
      apiGet("/api/host/classes"),
    ]);
    if (biblio.ok) {
      setQuizzes(biblio.data.quizzes);
      setCursor(biblio.data.nextCursor);
    }
    if (plan.ok) {
      setPlanning(plan.data);
      setFenetre(plan.data.defaultWindow || 5);
    }
    if (cls.ok) setClasses(cls.data.classes || []);
  }, []);

  useEffect(() => {
    if (account) charger();
  }, [account, charger]);

  async function voirPlus() {
    if (!cursor || busy) return;
    setBusy(true);
    const q = new URLSearchParams({
      before: String(cursor.before),
      ...(cursor.afterId ? { afterId: cursor.afterId } : {}),
    });
    const { ok, data } = await apiGet(`/api/host/quiz?${q}`);
    if (ok) {
      setQuizzes((prev) => [...(prev || []), ...data.quizzes]);
      setCursor(data.nextCursor);
    }
    setBusy(false);
  }

  async function importer(e) {
    e.preventDefault();
    setErreur("");
    setImportEnCours(true);
    const { ok, data } = await apiPost("/api/host/quiz/import-gforms", { url });
    setImportEnCours(false);
    if (!ok) {
      setErreur(data?.error || "Import impossible.");
      return;
    }
    // Rien n'est enregistré à ce stade : un formulaire qui n'est pas un
    // questionnaire n'a aucune bonne réponse, et le quiz serait refusé. On
    // passe donc par l'éditeur, où le formateur complète puis enregistre.
    if (!deposerImport(data)) {
      setErreur("Impossible de préparer l'import dans ce navigateur.");
      return;
    }
    router.push("/host/quiz/nouveau");
  }

  async function lancer(q) {
    setErreur("");
    setBusy(true);
    const { ok, data } = await apiPost(`/api/host/quiz/${q.id}/launch`, {
      classId: q.mode === "examen" ? classeChoisie || null : null,
    });
    setBusy(false);
    if (!ok) {
      setErreur(data?.error || "Lancement impossible.");
      return;
    }
    router.push(`/host/lobby?code=${data.code}`);
  }

  async function dupliquer(q) {
    setBusy(true);
    const { ok, data } = await apiPost(`/api/host/quiz/${q.id}/duplicate`, {});
    setBusy(false);
    if (!ok) setErreur(data?.error || "Duplication impossible.");
    else charger();
  }

  async function supprimer(q) {
    setBusy(true);
    const { ok, data } = await apiDelete(`/api/host/quiz/${q.id}`);
    setBusy(false);
    if (!ok) setErreur(data?.error || "Suppression impossible.");
    else charger();
  }

  async function programmer(e) {
    e.preventDefault();
    setErreur("");
    const startsAt = localToMs(quand);
    if (Number.isNaN(startsAt)) {
      setErreur("Indiquez une date et une heure.");
      return;
    }
    setBusy(true);
    const { ok, data } = await apiPost("/api/host/scheduled", {
      quizId: aProgrammer.id,
      classId: aProgrammer.mode === "examen" ? classeChoisie || null : null,
      startsAt,
      registrationWindowMin: fenetre,
    });
    setBusy(false);
    if (!ok) {
      setErreur(data?.error || "Programmation impossible.");
      return;
    }
    setAProgrammer(null);
    setDernierCode(data.scheduled.code);
    charger();
  }

  async function annuler(s) {
    setBusy(true);
    const { ok, data } = await apiDelete(`/api/host/scheduled/${s.id}`);
    setBusy(false);
    if (!ok) setErreur(data?.error || "Annulation impossible.");
    else charger();
  }

  if (loading) {
    return (
      <div className="center-work">
        <div className="spin" role="status" aria-label="Chargement" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="center-work">
        <div className="card" style={{ maxWidth: 440 }}>
          <EmptyState icon="bookOpen" title="Mes quiz">
            <p>Connectez-vous pour retrouver vos quiz enregistrés.</p>
            <Link href="/host" className="btn btn--primary">Créer un quiz</Link>
          </EmptyState>
        </div>
      </div>
    );
  }

  const aVenir = planning?.upcoming || [];
  const soldeInsuffisant = planning?.solde?.required && !planning.solde.affordable;

  return (
    <div className="stack gap-24">
      <div className="stack gap-8">
        <span className="eyebrow">Bibliothèque, import &amp; programmation</span>
        <h1 style={{ fontSize: "2rem" }}>Mes quiz</h1>
      </div>

      {erreur && (
        <div className="panel" role="alert">
          <p className="hint">
            <Icon name="alertTriangle" size={15} /> {erreur}
          </p>
        </div>
      )}

      {/* — Import Google Forms — */}
      <form className="card stack gap-12" onSubmit={importer}>
        <div className="stack gap-4">
          <span className="eyebrow">Importer</span>
          <h2 style={{ fontSize: "1.2rem" }}>Depuis un Google Form</h2>
        </div>
        <p className="hint">
          <Icon name="info" size={14} />
          <span>
            Dans Google Forms : <strong>Partager</strong> →{" "}
            <em>Toute personne disposant du lien</em>, puis collez le lien ici.
            Les bonnes réponses ne sont reprises que si votre formulaire est un{" "}
            <strong>questionnaire</strong> — sinon vous les désignerez à l&apos;étape
            suivante.
          </span>
        </p>
        <div className="row gap-8 wrap">
          <input
            className="input"
            style={{ flex: "1 1 320px" }}
            type="url"
            inputMode="url"
            placeholder="https://docs.google.com/forms/d/e/…/viewform"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-label="Lien du Google Form"
          />
          <button className="btn btn--primary" disabled={importEnCours || !url.trim()}>
            {importEnCours ? "Lecture…" : <>Importer <Icon name="arrowRight" size={15} /></>}
          </button>
        </div>
      </form>

      {/* — Planning — */}
      <div className="stack gap-12">
        <div className="row row--between wrap gap-8">
          <span className="eyebrow">Examens programmés</span>
          {planning && <span className="tiny muted">{aVenir.length} à venir</span>}
        </div>

        {soldeInsuffisant && (
          <div className="panel stack gap-8" role="alert">
            <p className="hint">
              <Icon name="alertTriangle" size={15} />
              <span>
                Votre solde ({planning.solde.balanceAr} Ar) ne couvre pas un
                examen à {planning.solde.priceAr} Ar. Une salle programmée
                s&apos;ouvre sans vous : rechargez avant l&apos;échéance, sinon
                le chrono ne démarrera pas.
              </span>
            </p>
            <Link href="/host/wallet" className="btn btn--ghost btn--compact">
              <Icon name="creditCard" size={15} /> Recharger
            </Link>
          </div>
        )}

        {aVenir.length === 0 ? (
          <div className="panel">
            <EmptyState icon="timer">
              <p>
                Aucun examen programmé. Choisissez un quiz ci-dessous et
                cliquez sur « Programmer » : la salle s&apos;ouvrira toute
                seule à l&apos;heure dite.
              </p>
            </EmptyState>
          </div>
        ) : (
          <div className="stack gap-8">
            {aVenir.map((s) => (
              <div key={s.id} className="grade-row">
                <span className="icon-badge" aria-hidden="true">
                  <Icon name="timer" size={17} />
                </span>
                <div className="grade-row__ans">
                  <div style={{ fontWeight: 700 }}>{s.title}</div>
                  <div className="muted tiny">
                    {heureLocale(s.startsAt)} · {libelle(s.startsAt - Date.now())}
                    {s.className ? ` · ${s.className}` : ""} ·{" "}
                    épreuve {s.registrationWindowMin} min après l&apos;ouverture
                  </div>
                </div>
                <CopyButton value={s.code} label={s.code} />
                <ConfirmButton
                  className="btn btn--ghost btn--compact"
                  confirmLabel="Annuler cet examen ?"
                  confirmYesLabel="Oui, annuler"
                  confirmNoLabel="Non"
                  split
                  onConfirm={() => annuler(s)}
                >
                  <Icon name="trash" size={15} />
                </ConfirmButton>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* — Bibliothèque — */}
      <div className="stack gap-12">
        <div className="row row--between wrap gap-8">
          <span className="eyebrow">Bibliothèque</span>
          <Link href="/host" className="btn btn--ghost btn--compact">
            <Icon name="plus" size={15} /> Nouveau quiz
          </Link>
        </div>

        {!quizzes ? (
          <div className="spin" role="status" aria-label="Chargement" style={{ margin: "0 auto" }} />
        ) : quizzes.length === 0 ? (
          <div className="panel">
            <EmptyState icon="bookOpen">
              <p>
                Vos quiz enregistrés apparaîtront ici — prêts à relancer sur
                une autre classe, à dupliquer ou à programmer.
              </p>
            </EmptyState>
          </div>
        ) : (
          <div className="stack gap-8">
            {quizzes.map((q) => (
              <div key={q.id} className="grade-row">
                <span className="icon-badge" aria-hidden="true">
                  <Icon name="bookOpen" size={17} />
                </span>
                <div className="grade-row__ans">
                  <div style={{ fontWeight: 700 }}>{q.title}</div>
                  <div className="muted tiny">
                    {q.questionCount} question{q.questionCount > 1 ? "s" : ""} ·{" "}
                    {MODES[q.mode] || q.mode} · {dureeCourte(q.totalDurationSec)}
                    {q.usageCount > 0
                      ? ` · ${q.usageCount} usage${q.usageCount > 1 ? "s" : ""}`
                      : " · jamais lancé"}
                    {q.source === "google-forms" ? " · importé de Google Forms" : ""}
                  </div>
                </div>
                <div className="row gap-8 wrap">
                  <button
                    type="button"
                    className="btn btn--primary btn--compact"
                    disabled={busy}
                    onClick={() => lancer(q)}
                  >
                    <Icon name="play" size={15} /> Lancer
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--compact"
                    disabled={busy}
                    onClick={() => {
                      setClasseChoisie("");
                      setAProgrammer(q);
                    }}
                  >
                    <Icon name="timer" size={15} /> Programmer
                  </button>
                  <Link href={`/host/quiz/${q.id}`} className="btn btn--ghost btn--compact">
                    <Icon name="penLine" size={15} /> Modifier
                  </Link>
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon"
                    aria-label="Dupliquer"
                    title="Dupliquer"
                    disabled={busy}
                    onClick={() => dupliquer(q)}
                  >
                    <Icon name="copy" size={15} />
                  </button>
                  <ConfirmButton
                    className="btn btn--ghost btn--icon"
                    confirmLabel="Supprimer ce quiz ?"
                    confirmYesLabel="Supprimer"
                    confirmNoLabel="Non"
                    split
                    onConfirm={() => supprimer(q)}
                  >
                    <Icon name="trash" size={15} />
                  </ConfirmButton>
                </div>
              </div>
            ))}
            {cursor && (
              <button
                type="button"
                className="btn btn--ghost btn--block"
                onClick={voirPlus}
                disabled={busy}
              >
                Voir les quiz plus anciens
              </button>
            )}
          </div>
        )}
      </div>

      {/* — Programmation : choix de la date — */}
      {aProgrammer && (
        <Modal onClose={() => setAProgrammer(null)} labelledBy="prog-titre" maxWidth={520}>
          <form className="stack gap-16" onSubmit={programmer}>
            <div className="row row--between">
              <h2 id="prog-titre" style={{ fontSize: "1.25rem" }}>
                Programmer « {aProgrammer.title} »
              </h2>
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                onClick={() => setAProgrammer(null)}
                aria-label="Fermer"
              >
                <Icon name="close" />
              </button>
            </div>

            <label className="stack gap-4">
              <span className="tiny muted">Ouverture de la salle</span>
              <input
                className="input"
                type="datetime-local"
                value={quand}
                onChange={(e) => setQuand(e.target.value)}
                required
              />
            </label>

            {aProgrammer.mode === "examen" && classes.length > 0 && (
              <label className="stack gap-4">
                <span className="tiny muted">Classe (examen nominatif)</span>
                <select
                  className="input"
                  value={classeChoisie}
                  onChange={(e) => setClasseChoisie(e.target.value)}
                >
                  <option value="">Sans classe — pseudos libres</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.studentCount})
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="stack gap-4">
              <span className="tiny muted">Fenêtre d&apos;inscription</span>
              <select
                className="input"
                value={fenetre}
                onChange={(e) => setFenetre(Number(e.target.value))}
              >
                {(planning?.windows || [3, 5, 10, 15, 30]).map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
              <span className="tiny muted">
                Les participants s&apos;inscrivent pendant ce délai, puis le
                chrono démarre tout seul. Passé ce point, plus personne
                n&apos;entre — comme pour tout examen lancé.
              </span>
            </label>

            <button className="btn btn--primary btn--block" disabled={busy}>
              {busy ? "Programmation…" : "Programmer"}
            </button>
          </form>
        </Modal>
      )}

      {/* — Code à distribuer — */}
      {dernierCode && (
        <Modal onClose={() => setDernierCode(null)} labelledBy="code-titre" maxWidth={440}>
          <div className="stack gap-16" style={{ textAlign: "center", alignItems: "center" }}>
            <span className="icon-badge" aria-hidden="true">
              <Icon name="check" size={19} />
            </span>
            <h2 id="code-titre" style={{ fontSize: "1.25rem" }}>
              Examen programmé
            </h2>
            <p className="muted tiny">
              Distribuez ce code dès maintenant : il est réservé, et la salle
              s&apos;ouvrira d&apos;elle-même à l&apos;heure prévue.
            </p>
            <div className="code-chip" style={{ fontSize: "1.6rem" }}>
              {dernierCode}
            </div>
            <div className="row gap-12 wrap" style={{ justifyContent: "center" }}>
              <CopyButton value={dernierCode} label="Copier le code" />
              <CopyButton
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/join?code=${dernierCode}`}
                label="Copier le lien"
                icon="link"
              />
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={() => setDernierCode(null)}
            >
              Fermer
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

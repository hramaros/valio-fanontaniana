import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayKey,
  dailySeries,
  encaisseTotal,
  consommeTotal,
  prepaidLiability,
  encaisseSeries,
  consommeSeries,
  signupsSeries,
  providerMix,
  arpuPayant,
  panierMoyenExamen,
  usageChurn,
  funnel,
  capacityMix,
} from "./adminStats.js";

// Un jour de référence en UTC pour des calculs déterministes.
const J = (iso) => Date.parse(iso);

test("dayKey suit le fuseau EAT (UTC+3) : 22h UTC est déjà le lendemain à Tana", () => {
  // 2026-07-21T22:30Z = 2026-07-22T01:30 à Tana → jour local 22.
  assert.equal(dayKey(J("2026-07-21T22:30:00Z")), "2026-07-22");
  assert.equal(dayKey(J("2026-07-21T10:00:00Z")), "2026-07-21");
  // UTC explicite (offset 0) pour comparer.
  assert.equal(dayKey(J("2026-07-21T22:30:00Z"), 0), "2026-07-21");
});

test("dailySeries comble les jours vides à zéro", () => {
  const items = [
    { at: J("2026-07-20T08:00:00Z") },
    { at: J("2026-07-20T09:00:00Z") },
    { at: J("2026-07-22T08:00:00Z") },
  ];
  const serie = dailySeries(items, {
    from: J("2026-07-20T00:00:00Z"),
    to: J("2026-07-22T20:00:00Z"),
    ts: (x) => x.at,
    tzOffsetMin: 0,
  });
  assert.deepEqual(serie, [
    { day: "2026-07-20", value: 2 },
    { day: "2026-07-21", value: 0 },
    { day: "2026-07-22", value: 1 },
  ]);
});

test("dailySeries somme une valeur et ignore le hors-fenêtre", () => {
  const txns = [
    { at: J("2026-07-20T08:00:00Z"), montant: 5000 },
    { at: J("2026-07-20T09:00:00Z"), montant: 2000 },
    { at: J("2026-07-19T09:00:00Z"), montant: 9999 }, // avant la fenêtre
  ];
  const serie = dailySeries(txns, {
    from: J("2026-07-20T00:00:00Z"),
    to: J("2026-07-20T23:59:00Z"),
    ts: (x) => x.at,
    value: (x) => x.montant,
    tzOffsetMin: 0,
  });
  assert.deepEqual(serie, [{ day: "2026-07-20", value: 7000 }]);
});

test("encaissé ne compte que les recharges confirmées", () => {
  const txns = [
    { status: "completed", amountAr: 5000 },
    { status: "pending", amountAr: 3000 },
    { status: "failed", amountAr: 9999 },
    { status: "completed", amountAr: 2000 },
  ];
  assert.equal(encaisseTotal(txns), 7000);
});

test("consommé ne compte que les examens réellement débités", () => {
  const exams = [
    { charged: true, priceAr: 1000 },
    { charged: false, priceAr: 2000 }, // joué mais solde insuffisant
    { charged: true, priceAr: 2000 },
  ];
  assert.equal(consommeTotal(exams), 3000);
});

test("passif prépayé = somme des soldes non consommés", () => {
  assert.equal(
    prepaidLiability([{ balanceAr: 5000 }, { balanceAr: 0 }, { balanceAr: 1500 }]),
    6500,
  );
});

test("encaisseSeries date sur completedAt et non createdAt", () => {
  const txns = [
    {
      status: "completed",
      amountAr: 5000,
      createdAt: J("2026-07-20T23:00:00Z"),
      completedAt: J("2026-07-21T01:00:00Z"), // confirmé le lendemain local (Tana)
    },
  ];
  const serie = encaisseSeries(txns, {
    from: J("2026-07-20T00:00:00Z"),
    to: J("2026-07-22T00:00:00Z"),
  });
  // completedAt 01:00Z + 3h = 04:00 local le 21 → bucket du 21.
  const nonNul = serie.filter((p) => p.value > 0);
  assert.deepEqual(nonNul, [{ day: "2026-07-21", value: 5000 }]);
});

test("consommeSeries agrège le prix des examens débités par jour", () => {
  const exams = [
    { charged: true, priceAr: 1000, endedAt: J("2026-07-20T10:00:00Z") },
    { charged: true, priceAr: 2000, endedAt: J("2026-07-20T12:00:00Z") },
    { charged: false, priceAr: 2000, endedAt: J("2026-07-20T13:00:00Z") },
  ];
  const serie = consommeSeries(exams, {
    from: J("2026-07-20T00:00:00Z"),
    to: J("2026-07-20T23:00:00Z"),
    tzOffsetMin: 0,
  });
  assert.deepEqual(serie, [{ day: "2026-07-20", value: 3000 }]);
});

test("providerMix répartit mot de passe et Google", () => {
  assert.deepEqual(
    providerMix([
      { provider: "password" },
      { provider: "google" },
      { provider: "google" },
      {}, // défaut = mot de passe
    ]),
    { password: 2, google: 2 },
  );
});

test("ARPU rapporté aux clients payants, pas à tous les comptes", () => {
  const txns = [
    { status: "completed", amountAr: 5000, accountId: "a" },
    { status: "completed", amountAr: 5000, accountId: "a" }, // même payeur
    { status: "completed", amountAr: 2000, accountId: "b" },
    { status: "pending", amountAr: 9999, accountId: "c" }, // pas encore payé
  ];
  const r = arpuPayant(txns);
  assert.equal(r.total, 12000);
  assert.equal(r.payeurs, 2);
  assert.equal(r.arpuAr, 6000);
});

test("ARPU : aucun payeur → 0, pas de division par zéro", () => {
  assert.deepEqual(arpuPayant([{ status: "pending", amountAr: 1000, accountId: "a" }]), {
    total: 0,
    payeurs: 0,
    arpuAr: 0,
  });
});

test("panier moyen d'examen ignore les non débités", () => {
  assert.equal(
    panierMoyenExamen([
      { charged: true, priceAr: 1000 },
      { charged: true, priceAr: 2000 },
      { charged: false, priceAr: 2000 },
    ]),
    1500,
  );
});

test("churn : actif le mois précédent, silencieux ce mois-ci", () => {
  const M = 30 * 86400000;
  const now = J("2026-07-31T00:00:00Z");
  const curStart = now - M;
  const prevStart = now - 2 * M;
  const exams = [
    { accountId: "fidele", endedAt: prevStart + 1000 }, // actif avant
    { accountId: "fidele", endedAt: curStart + 1000 }, //  ET pendant → retenu
    { accountId: "parti", endedAt: prevStart + 2000 }, // actif avant seulement → perdu
    { accountId: "nouveau", endedAt: curStart + 3000 }, // seulement ce mois → hors calcul
  ];
  const r = usageChurn(exams, { prevStart, curStart, now });
  assert.equal(r.actifsAvant, 2);
  assert.equal(r.retenus, 1);
  assert.equal(r.perdus, 1);
  assert.equal(r.taux, 0.5);
});

test("entonnoir : parts Libre / Examen et taux de conversion", () => {
  const plays = [
    { mode: "libre" },
    { mode: "libre" },
    { mode: "libre" },
    { mode: "examen" },
  ];
  assert.deepEqual(funnel(plays), { libre: 3, examen: 1, total: 4, conversion: 0.25 });
});

test("entonnoir vide n'explose pas", () => {
  assert.deepEqual(funnel([]), { libre: 0, examen: 0, total: 0, conversion: 0 });
});

test("mix capacité ne compte que les examens", () => {
  const exams = [
    { mode: "examen", capacity: "small" },
    { mode: "examen", capacity: "unlimited" },
    { mode: "examen", capacity: "small" },
    { mode: "libre", capacity: "small" }, // ignoré
  ];
  assert.deepEqual(capacityMix(exams), { small: 2, unlimited: 1 });
});

#!/usr/bin/env node
/**
 * Rattrapage des index globaux (pilotage) depuis les données déjà en base.
 *
 * Les index de `src/lib/indexes.js` ne captent que ce qui s'écrit après leur
 * mise en service : ce script reconstruit l'antériorité. Il est idempotent,
 * donc rejouable sans risque.
 *
 *   Simulation (par défaut — n'écrit rien) :
 *     node --env-file=.env.local scripts/backfill-indexes.mjs
 *
 *   Application réelle :
 *     node --env-file=.env.local scripts/backfill-indexes.mjs --write
 *
 * `--env-file` charge les identifiants Redis, que Next.js lit automatiquement
 * mais qu'un script Node simple ne connaît pas. En CI ou sur un poste où les
 * variables sont déjà exportées, l'option est inutile.
 *
 * ⚠️ Ce script parcourt la base avec SCAN : c'est une tâche d'exploitation
 * ponctuelle, jamais quelque chose à appeler depuis une requête web.
 */
import { backfillIndexes } from "../src/lib/backfill.js";

const write = process.argv.includes("--write");

const nombre = (n) => new Intl.NumberFormat("fr-FR").format(n);

function ligne(titre, stat) {
  const details = [];
  if (stat.orphelins) details.push(`${nombre(stat.orphelins)} illisible(s)`);
  if (stat.sansDate) details.push(`${nombre(stat.sansDate)} sans date`);
  const suffixe = details.length ? `  (${details.join(", ")})` : "";
  console.log(
    `  ${titre.padEnd(14)} ${nombre(stat.indexed).padStart(7)} indexé(s)${suffixe}`,
  );
}

try {
  console.log(
    write
      ? "\nRattrapage des index — ÉCRITURE RÉELLE\n"
      : "\nRattrapage des index — simulation (aucune écriture)\n",
  );

  const debut = Date.now();
  const r = await backfillIndexes({ dryRun: !write });
  const duree = ((Date.now() - debut) / 1000).toFixed(1);

  ligne("Comptes", r.accounts);
  ligne("Examens", r.exams);
  ligne("Recharges", r.txns);
  console.log(
    `  ${"Activité".padEnd(14)} ${nombre(r.lastSeen).padStart(7)} compte(s) datés d'après leur dernier examen`,
  );
  console.log(`\nTerminé en ${duree}s.`);

  if (!write) {
    console.log("Relancez avec --write pour appliquer.\n");
  } else if (r.txns.indexed === 0) {
    // Signal utile : une base active sans aucune recharge indexée suggère que
    // le TTL de 30 j (depuis retiré) les avait déjà toutes détruites.
    console.log(
      "\nAucune recharge trouvée. Si des paiements ont eu lieu il y a plus\n" +
        "d'un mois, ils ont été détruits par l'ancien TTL — c'est irrécupérable.\n",
    );
  } else {
    console.log("");
  }
} catch (err) {
  const msg = String(err?.message || err);
  console.error(`\nÉchec du rattrapage : ${msg}\n`);
  if (msg.includes("Redis non configuré")) {
    console.error(
      "Les identifiants Redis sont absents. Chargez-les avec :\n" +
        "  node --env-file=.env.local scripts/backfill-indexes.mjs\n" +
        "ou récupérez-les depuis Vercel (vercel env pull .env.local).\n",
    );
  }
  process.exit(1);
}

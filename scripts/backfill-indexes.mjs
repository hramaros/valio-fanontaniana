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

// — Avancement —
//
// Sur stderr, jamais sur stdout : le rapport final est la sortie du script,
// la progression n'est qu'un signe de vie. Les séparer permet de filtrer le
// rapport (`| tail`) sans perdre l'un ni l'autre.
//
// Sans ce signal, le parcours `SCAN` n'affiche rien pendant toute sa durée —
// un aller-retour HTTP par lot de 200 clés — et devient indistinguable d'un
// blocage réseau.
const interactif = process.stderr.isTTY;
let dernierAffichage = 0;
let derniereEtape = null;

function progression({ step, kind, count }) {
  const maintenant = Date.now();
  const nouvelleEtape = step !== derniereEtape;
  // L'étranglement est PAR ÉTAPE, et une nouvelle étape s'annonce toujours :
  // un intervalle global laisserait la phase la plus longue muette au seul
  // motif que la précédente vient d'écrire — exactement le silence à éviter.
  // En terminal on réécrit la même ligne, donc on rafraîchit souvent ; sinon
  // chaque appel ajoute une ligne et on l'espace pour ne pas inonder un log.
  if (
    !nouvelleEtape &&
    maintenant - dernierAffichage < (interactif ? 150 : 2000)
  ) {
    return;
  }
  // En terminal on écrasait la ligne en place : il faut la clore avant de
  // passer à l'étape suivante. En sortie capturée, chaque écriture finit déjà
  // par un saut de ligne.
  if (nouvelleEtape && interactif && derniereEtape !== null) {
    process.stderr.write("\n");
  }
  derniereEtape = step;
  dernierAffichage = maintenant;
  // Accord en nombre, et surtout : on n'écrit pas « écrits » pendant une
  // simulation, où rien ne l'est.
  const pluriel = count > 1 ? "s" : "";
  const quoi =
    kind === "scan"
      ? `clé${pluriel} parcourue${pluriel}`
      : write
        ? `index écrit${pluriel}`
        : `index simulé${pluriel}`;
  const texte = `${step} : ${nombre(count)} ${quoi}…`;
  if (interactif) process.stderr.write(`\r  ${texte.padEnd(52)}`);
  else process.stderr.write(`  ${texte}\n`);
}

/** Efface la ligne d'avancement avant d'imprimer le rapport. */
function finProgression() {
  if (interactif) process.stderr.write(`\r${" ".repeat(54)}\r`);
}

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
  const r = await backfillIndexes({ dryRun: !write, onProgress: progression });
  const duree = ((Date.now() - debut) / 1000).toFixed(1);
  finProgression();

  ligne("Comptes", r.accounts);
  ligne("Examens", r.exams);
  ligne("Recharges", r.txns);
  console.log(
    `  ${"Par compte".padEnd(14)} ${nombre(r.examsParCompte.entries).padStart(7)} examen(s) sur ${nombre(r.examsParCompte.keys)} compte(s)`,
  );
  console.log(
    `  ${"Par classe".padEnd(14)} ${nombre(r.examsParClasse.entries).padStart(7)} examen(s) sur ${nombre(r.examsParClasse.keys)} classe(s)`,
  );
  console.log(
    `  ${"Recharges/cpt".padEnd(14)} ${nombre(r.txnsParCompte.entries).padStart(7)} recharge(s) sur ${nombre(r.txnsParCompte.keys)} compte(s)`,
  );
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
  finProgression();
  const msg = String(err?.message || err);
  // L'échec part sur stdout, avec le rapport : ce script est un outil
  // d'exploitation lu par un humain, et son échec fait partie de ce qu'il a à
  // dire. Le mettre sur stderr le rendait invisible dès que l'appelant ne
  // remonte que stdout — on voyait l'en-tête, puis rien, sans savoir s'il
  // tournait encore ou s'il avait échoué. Le code de sortie 1 reste le signal
  // pour les machines, et stderr est réservé à l'avancement.
  console.log(`\nÉchec du rattrapage : ${msg}\n`);
  if (msg.includes("Redis non configuré")) {
    console.log(
      "Les identifiants Redis sont absents. Chargez-les avec :\n" +
        "  node --env-file=.env.production scripts/backfill-indexes.mjs\n" +
        "ou récupérez-les depuis Vercel :\n" +
        "  vercel env pull .env.production --environment=production\n",
    );
  }
  process.exit(1);
}

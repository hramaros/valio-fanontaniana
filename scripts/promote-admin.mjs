#!/usr/bin/env node
/**
 * Promotion (ou rétrogradation) d'un compte, par email.
 *
 * Résout l'amorçage : le premier admin ne peut pas être promu depuis
 * l'interface, puisqu'il faudrait déjà être admin pour y accéder. Passer par
 * la ligne de commande évite d'exposer sur le web un endpoint de promotion,
 * qui serait une cible de choix pour une escalade de privilèges.
 *
 *   Simulation (par défaut — n'écrit rien) :
 *     node --env-file=.env.local scripts/promote-admin.mjs vous@exemple.com
 *
 *   Application réelle :
 *     node --env-file=.env.local scripts/promote-admin.mjs vous@exemple.com --write
 *
 *   Rétrograder :
 *     node --env-file=.env.local scripts/promote-admin.mjs vous@exemple.com --role trainer --write
 */
import { getAccountByEmail, setRole, ROLE_ADMIN, ROLE_TRAINER } from "../src/lib/accounts.js";

const args = process.argv.slice(2);
const write = args.includes("--write");
const roleIdx = args.indexOf("--role");
const role = roleIdx !== -1 ? args[roleIdx + 1] : ROLE_ADMIN;
const email = args.find((a) => !a.startsWith("--") && a !== role);

function quitter(message, code = 1) {
  console.error(`\n${message}\n`);
  process.exit(code);
}

if (!email) {
  quitter(
    "Email manquant.\n\n" +
      "  node --env-file=.env.local scripts/promote-admin.mjs vous@exemple.com [--role admin|trainer] [--write]",
  );
}
if (role !== ROLE_ADMIN && role !== ROLE_TRAINER) {
  quitter(`Rôle inconnu : « ${role} ». Attendu : ${ROLE_ADMIN} ou ${ROLE_TRAINER}.`);
}

try {
  const compte = await getAccountByEmail(email);
  if (!compte) {
    quitter(
      `Aucun compte pour « ${email} ».\n` +
        "La personne doit d'abord créer son compte formateur dans l'application.",
    );
  }

  console.log(`\nCompte : ${compte.email}  (${compte.name})`);
  console.log(`Rôle actuel : ${compte.role}`);
  console.log(`Rôle visé   : ${role}`);

  if (compte.role === role) {
    console.log("\nDéjà dans cet état — rien à faire.\n");
    process.exit(0);
  }

  if (!write) {
    console.log("\nSimulation : rien n'a été écrit. Relancez avec --write pour appliquer.\n");
    process.exit(0);
  }

  const res = await setRole(compte.id, role);
  if (!res.ok) quitter(`Échec : ${res.error}`);

  console.log(`\n✓ ${res.account.email} est désormais « ${res.account.role} ».`);
  // Le rôle est relu à chaque requête (la session ne mémorise qu'un
  // identifiant de compte, pas de privilège) : un simple rafraîchissement
  // suffit, inutile de se reconnecter.
  console.log("Effet immédiat — un rafraîchissement de page suffit.\n");
} catch (err) {
  const msg = String(err?.message || err);
  if (msg.includes("Redis non configuré")) {
    quitter(
      `${msg}\n\nChargez les identifiants :\n` +
        "  node --env-file=.env.local scripts/promote-admin.mjs …\n" +
        "ou récupérez-les depuis Vercel (vercel env pull .env.local).",
    );
  }
  quitter(`Échec : ${msg}`);
}

// Amorçage de l'accès admin par la configuration (variable ADMIN_EMAILS).
//
// Pourquoi ici plutôt qu'un script : le déploiement est sur Vercel, sans
// shell durable. Une variable d'environnement configurée dans le tableau de
// bord Vercel est le levier natif — aucune commande à lancer. Le compte dont
// l'email figure dans la liste devient admin dès sa connexion (voir
// l'auto-promotion dans accounts.js).
//
// `role` reste la source de vérité au runtime : ADMIN_EMAILS ne fait que
// PROMOUVOIR. Retirer un email de la liste ne rétrograde pas automatiquement
// (le rôle est déjà persisté) — la rétrogradation est manuelle, via
// scripts/promote-admin.mjs --role trainer. Cela évite qu'un admin promu à la
// main (hors liste) soit rétrogradé à sa prochaine connexion.
//
// ⚠️ Jamais préfixée NEXT_PUBLIC_ : cette liste ne doit pas fuiter au client.

const norm = (e) => String(e || "").trim().toLowerCase();

/** Liste des emails admin configurés (normalisés, vide si non défini). */
export function adminEmailList() {
  // Lu à l'appel, pas au chargement du module : reflète l'environnement
  // courant (et reste testable en modifiant process.env).
  return String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map(norm)
    .filter(Boolean);
}

/**
 * Cet email est-il configuré comme admin ?
 * Fail-closed : une liste vide (variable absente ou mal saisie) ne donne
 * l'accès à personne, jamais l'inverse.
 */
export function isConfiguredAdmin(email) {
  const e = norm(email);
  if (!e) return false;
  return adminEmailList().includes(e);
}

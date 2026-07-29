// ⚠️ DIAGNOSTIC TEMPORAIRE DE RÉCUPÉRATION — À SUPPRIMER APRÈS USAGE. ⚠️
//
// But : récupérer des variables d'environnement marquées « Sensitive » sur
// Vercel. Une variable Sensitive y devient write-only (ni le dashboard ni
// `vercel env pull` ne la ré-affichent), MAIS elle reste injectée dans le
// runtime au déploiement. Ce hook les imprime donc dans les Runtime Logs de
// Vercel, seul moyen de les relire quand la copie locale est perdue.
//
// `register()` s'exécute une fois au démarrage de l'instance serveur (à froid
// sur Vercel : au premier accès après déploiement).
//
// Gardé derrière `DEBUG_ENV=1` pour qu'il n'imprime pas les secrets à CHAQUE
// futur déploiement si on oublie de retirer le code. Procédure :
//   1. Ajouter la variable DEBUG_ENV = 1 dans Vercel (Production).
//   2. Redéployer, puis ouvrir l'app une fois (déclenche le démarrage).
//   3. Lire les valeurs dans Vercel → le déploiement → Runtime Logs.
//   4. RETIRER ce fichier ET la variable DEBUG_ENV, puis redéployer.
//   5. Envisager de renouveler les secrets ainsi passés dans les logs
//      (clé Stripe, secret Google, token Redis…), car les logs sont conservés.

export function register() {
  if (process.env.DEBUG_ENV !== "1") return;

  const dump = Object.keys(process.env)
    .sort()
    .map((k) => `  ${k} = ${process.env[k]}`)
    .join("\n");

  // Un seul console.log : sur Vercel, chaque appel = une ligne de log
  // séparée, plus difficile à recopier qu'un bloc unique.
  console.log(
    "\n===== DEBUG_ENV : variables d'environnement (diagnostic temporaire) =====\n" +
      dump +
      "\n========================================================================\n",
  );
}

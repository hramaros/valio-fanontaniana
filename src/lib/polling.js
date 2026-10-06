// Cadences de rafraîchissement (ms).
//
// Ces valeurs ne sont pas cosmétiques : elles pilotent directement la facture
// Redis. Chaque requête d'état coûte 3 commandes (getMeta + smembers + mget),
// et les écrans PARTICIPANT sont multipliés par le nombre d'élèves — à 20
// participants, la seule phase de jeu représente ~63 % de la charge d'une
// séance.
//
// Le passage d'un 1,2 s uniforme à ces valeurs divise la charge par deux
// (~47 000 → ~22 000 commandes par examen de 20 participants), ce qui double
// le nombre d'examens tenant dans le palier gratuit Upstash (11 → 23 par mois)
// et repousse d'autant la migration vers un Redis auto-hébergé.
//
// Règle d'arbitrage : on ralentit d'autant plus que l'attente est passive.
// Ce qui touche à un basculement d'écran visible reste réactif.

/** Salle d'attente élève : le lancement est LA transition visible. */
export const JOIN_MS = 2000;

/**
 * Écran de jeu. Ne sert qu'à détecter une clôture anticipée par le formateur
 * (bouton « Terminer ») : le chrono, lui, est calculé côté client depuis
 * `startedAt + durationMs`. Un délai de 3 s est imperceptible en classe, où la
 * fin est de toute façon annoncée à voix haute.
 */
export const PLAY_MS = 3000;

/** Attente passive du classement, côté élève. */
export const RESULT_MS = 3000;

/** Lobby formateur : voir les pseudos arriver. Un seul poller, coût marginal. */
export const HOST_LOBBY_MS = 2000;

/** Suivi de partie côté formateur (deux pollers simultanés sur le même écran). */
export const HOST_STATE_MS = 2500;
export const HOST_BOARD_MS = 2500;

/** Vue de correction : le formateur y agit, il n'attend pas. */
export const HOST_REVIEW_MS = 2000;

/* ------------------------------------------------------------------ */
/* Plafonds de backoff                                                 */
/* ------------------------------------------------------------------ */
//
// Le backoff ralentit tant que rien ne change, et repart à la cadence de base
// au premier changement (voir `usePolling`). Il n'est activé que là où
// l'attente est longue ET où un retard de détection ne gêne personne.
//
// Volontairement ABSENT de :
//  - `/join` : ce que l'élève attend (le lancement) EST le changement. Ralentir
//    à mesure que l'attente dure retarderait précisément le moment le plus
//    visible du parcours — c'est l'inverse de ce qu'il faut.
//  - `/play` : doit détecter une clôture anticipée sans traîner.
//  - `/host/results` : le formateur y travaille, il n'attend pas.

/** Lobby formateur : chaque arrivée d'élève remet la cadence à zéro. */
export const HOST_LOBBY_BACKOFF_MS = 6000;

/** Attente du classement : peut durer toute la correction des rédactions. */
export const RESULT_BACKOFF_MS = 8000;

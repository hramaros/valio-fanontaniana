// Logique PURE des modes de quiz (sans I/O), testable avec `node --test`.
// Mode Libre = gratuit, plafonné. Mode Examen = payant (débit en fin de session).

export const MODE_LIBRE = "libre";
export const MODE_EXAMEN = "examen";
export const CAP_SMALL = "small";
export const CAP_UNLIMITED = "unlimited";

export const LIBRE_MAX = 10;
export const EXAMEN_SMALL_MAX = 20;
export const PRICE_SMALL_AR = 1000;
export const PRICE_UNLIMITED_AR = 2000;

// Crédit de bienvenue : un examen offert à l'inscription. Le formateur vit la
// valeur complète (note /20, correction, PDF) avant qu'on lui parle d'argent,
// et n'est jamais bloqué devant sa classe à son premier usage. Le coût réel est
// quasi nul (infra à coût marginal proche de zéro).
export const WELCOME_CREDIT_AR = PRICE_SMALL_AR;

export function normalizeMode(mode) {
  return mode === MODE_EXAMEN ? MODE_EXAMEN : MODE_LIBRE;
}

export function normalizeCapacity(capacity) {
  return capacity === CAP_UNLIMITED ? CAP_UNLIMITED : CAP_SMALL;
}

/** Plafond d'inscription dans la salle. `null` = illimité (Examen illimité). */
export function maxParticipants(mode, capacity) {
  if (normalizeMode(mode) === MODE_LIBRE) return LIBRE_MAX;
  return normalizeCapacity(capacity) === CAP_UNLIMITED ? null : EXAMEN_SMALL_MAX;
}

/** Prix en Ariary débité en fin de session (0 en mode Libre). */
export function examPriceAr(mode, capacity) {
  if (normalizeMode(mode) === MODE_LIBRE) return 0;
  return normalizeCapacity(capacity) === CAP_UNLIMITED
    ? PRICE_UNLIMITED_AR
    : PRICE_SMALL_AR;
}

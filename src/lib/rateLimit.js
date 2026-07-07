import { getRedis } from "./redis.js";

// Limiteur de débit « fenêtre fixe » (INCR + EXPIRE) : réutilise le Redis déjà
// en place, aucune dépendance externe. Suffisant comme protection anti-abus
// basique (pas besoin de la précision d'un sliding-window pour ce cas d'usage).
//
// Volontairement PAS appliqué à join/register/answer (déroulé de partie) :
// une classe entière peut se présenter derrière une seule adresse IP
// partagée (réseau d'établissement) et un plafond par IP y casserait un
// usage légitime. Ces endpoints restent protégés par d'autres garde-fous
// (capacité de salle, un seul vote par question). Voir TODO.md.
const BUCKETS = {
  auth: { limit: 10, windowSec: 60 }, // login / signup
  verify: { limit: 20, windowSec: 60 }, // consultation publique d'un examen
  passwordReset: { limit: 5, windowSec: 3600 }, // demande de reset de mot de passe
};

/**
 * Autorise ou refuse un appel pour `bucket`/`identifier`. Retourne `true` si
 * la requête est autorisée (et compte pour la fenêtre en cours), `false` si
 * la limite est dépassée.
 */
export async function checkRateLimit(bucket, identifier) {
  const config = BUCKETS[bucket];
  if (!config) throw new Error(`checkRateLimit: bucket inconnu "${bucket}".`);
  const redis = getRedis();
  const key = `ratelimit:${bucket}:${identifier}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, config.windowSec);
  return count <= config.limit;
}

/** Adresse IP du client, pour clé de limitation (Vercel renseigne x-forwarded-for). */
export function clientIp(request) {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "unknown";
}

import { getRedis } from "./redis.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Verrou Redis (SET NX EX) pour sérialiser un traitement critique entre
 * invocations serverless concurrentes (ex. clôture d'examen pollée par
 * plusieurs clients à la fois). Si le verrou n'est pas obtenu après
 * quelques tentatives, abandonne plutôt que de bloquer : le polling
 * client (≤1.5s) verra de toute façon l'état posé par le gagnant au tour
 * suivant.
 *
 * Retourne `{ locked: true, result }` si `fn` a été exécutée sous verrou,
 * ou `{ locked: false }` si le verrou n'a pas pu être acquis.
 */
export async function withLock(
  lockKey,
  fn,
  { ttlSec = 10, retries = 4, retryDelayMs = 60 } = {},
) {
  const redis = getRedis();
  for (let attempt = 0; attempt <= retries; attempt++) {
    const acquired = await redis.set(lockKey, "1", { nx: true, ex: ttlSec });
    if (acquired) {
      try {
        const result = await fn();
        return { locked: true, result };
      } finally {
        await redis.del(lockKey).catch(() => {});
      }
    }
    if (attempt < retries) await sleep(retryDelayMs * (attempt + 1));
  }
  return { locked: false };
}

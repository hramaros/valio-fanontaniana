import { getRedis } from "./redis.js";

// Taux de change EUR → Ariary pour la facturation Stripe (Stripe facture en EUR,
// le solde reste en Ariary). Repli en cascade pour ne jamais faire dépendre un
// paiement de la disponibilité de l'API de change :
//   cache frais (6h) → dernier taux connu (durable) → constante d'env.
const CACHE_KEY = "fxRate:EUR:MGA";
const LAST_KEY = "fxRate:EUR:MGA:last";
const CACHE_TTL_SEC = 6 * 3600;
const DEFAULT_TIMEOUT_MS = 3000;
const FALLBACK_RATE = 4800;

async function fetchLiveRate(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/EUR", {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rate = data?.rates?.MGA;
    if (!rate || rate <= 0) throw new Error("taux MGA absent de la réponse");
    return rate;
  } finally {
    clearTimeout(timer);
  }
}

/** Taux « Ariary pour 1 EUR ». `options.timeoutMs` : override réservé aux tests. */
export async function getArPerEurRate(options = {}) {
  const redis = getRedis();
  const cached = await redis.get(CACHE_KEY);
  if (cached != null) return cached;

  try {
    const rate = await fetchLiveRate(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    await redis.set(CACHE_KEY, rate, { ex: CACHE_TTL_SEC });
    await redis.set(LAST_KEY, rate); // durable, mis à jour seulement sur succès
    return rate;
  } catch (err) {
    console.error("fxRate: taux en direct indisponible, repli :", err?.message || err);
    const last = await redis.get(LAST_KEY);
    if (last != null) return last;
    return Number(process.env.STRIPE_EUR_TO_AR_FALLBACK_RATE) || FALLBACK_RATE;
  }
}

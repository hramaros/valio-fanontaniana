// Faux Redis en mémoire pour les tests (voir setRedisClient()). Clone les
// valeurs à la lecture/écriture pour mimer la (dé)sérialisation Upstash et
// attraper ainsi les bugs de mutation par référence. Couvre l'union des
// méthodes utilisées par les modules de src/lib/*.js, y compris la
// sémantique NX (le verrou de src/lib/lock.js en dépend) et une simulation
// réelle du TTL (`ex`/`expire`) pour pouvoir tester le cache de fxRate.js
// et les fenêtres du rate limiter de bout en bout, pas seulement en théorie.
export function createFakeRedis() {
  const store = new Map();
  const expiresAt = new Map(); // key -> timestamp ms, absent = pas de TTL
  const sets = new Map();
  const lists = new Map();
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const end = (arr, stop) => (stop < 0 ? arr.length + stop + 1 : stop + 1);

  function isExpired(key) {
    const exp = expiresAt.get(key);
    if (exp == null) return false;
    if (Date.now() < exp) return false;
    store.delete(key);
    expiresAt.delete(key);
    return true;
  }
  function has(key) {
    isExpired(key);
    return store.has(key);
  }

  return {
    async set(key, value, opts) {
      if (opts?.nx && has(key)) return null;
      store.set(key, clone(value));
      if (opts?.ex) expiresAt.set(key, Date.now() + opts.ex * 1000);
      else expiresAt.delete(key);
      return "OK";
    },
    async get(key) {
      return has(key) ? clone(store.get(key)) : null;
    },
    async del(key) {
      expiresAt.delete(key);
      return store.delete(key) ? 1 : 0;
    },
    async getdel(key) {
      const v = has(key) ? clone(store.get(key)) : null;
      store.delete(key);
      expiresAt.delete(key);
      return v;
    },
    async exists(key) {
      return has(key) ? 1 : 0;
    },
    async incr(key) {
      const current = has(key) ? Number(store.get(key)) || 0 : 0;
      const next = current + 1;
      store.set(key, next);
      return next;
    },
    async sadd(key, ...members) {
      const s = sets.get(key) || new Set();
      members.flat().forEach((m) => s.add(m));
      sets.set(key, s);
      return members.length;
    },
    async smembers(key) {
      return [...(sets.get(key) || [])];
    },
    async srem(key, ...members) {
      const s = sets.get(key);
      if (!s) return 0;
      let removed = 0;
      for (const m of members.flat()) {
        if (s.delete(m)) removed++;
      }
      return removed;
    },
    async mget(...keys) {
      return keys.flat().map((k) => (has(k) ? clone(store.get(k)) : null));
    },
    async expire(key, sec) {
      if (!has(key)) return 0;
      expiresAt.set(key, Date.now() + sec * 1000);
      return 1;
    },
    async lpush(key, ...vals) {
      const arr = lists.get(key) || [];
      for (const v of vals.flat()) arr.unshift(v);
      lists.set(key, arr);
      return arr.length;
    },
    async lrange(key, start, stop) {
      const arr = lists.get(key) || [];
      return arr.slice(start, end(arr, stop)).map(clone);
    },
    async ltrim(key, start, stop) {
      const arr = lists.get(key) || [];
      lists.set(key, arr.slice(start, end(arr, stop)));
      return "OK";
    },
    async lrem(key, _count, value) {
      const arr = lists.get(key) || [];
      const filtered = arr.filter((v) => v !== value);
      lists.set(key, filtered);
      return arr.length - filtered.length;
    },
  };
}

// Faux Redis en mémoire pour les tests (voir setRedisClient()). Clone les
// valeurs à la lecture/écriture pour mimer la (dé)sérialisation Upstash et
// attraper ainsi les bugs de mutation par référence. Couvre l'union des
// méthodes utilisées par les modules de src/lib/*.js, y compris la
// sémantique NX (le verrou de src/lib/lock.js en dépend).
export function createFakeRedis() {
  const store = new Map();
  const sets = new Map();
  const lists = new Map();
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const end = (arr, stop) => (stop < 0 ? arr.length + stop + 1 : stop + 1);

  return {
    async set(key, value, opts) {
      if (opts?.nx && store.has(key)) return null;
      store.set(key, clone(value));
      return "OK";
    },
    async get(key) {
      return store.has(key) ? clone(store.get(key)) : null;
    },
    async del(key) {
      return store.delete(key) ? 1 : 0;
    },
    async getdel(key) {
      const v = store.has(key) ? clone(store.get(key)) : null;
      store.delete(key);
      return v;
    },
    async exists(key) {
      return store.has(key) ? 1 : 0;
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
      return keys.flat().map((k) => (store.has(k) ? clone(store.get(k)) : null));
    },
    async expire() {
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

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
  const zsets = new Map(); // key -> Map(member -> score)
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const end = (arr, stop) => (stop < 0 ? arr.length + stop + 1 : stop + 1);

  // Bornes de ZRANGE BYSCORE. On accepte les nombres et ±inf ; toute autre
  // forme (intervalles exclusifs « (5 », lexicographiques…) lève plutôt que
  // de renvoyer un résultat faux en silence — un double de test qui ment est
  // pire que pas de double du tout.
  function scoreBound(v, fallback) {
    if (typeof v === "number") return v;
    const s = String(v);
    if (s === "-inf") return -Infinity;
    if (s === "+inf" || s === "inf") return Infinity;
    const n = Number(s);
    if (Number.isFinite(n)) return n;
    if (v == null) return fallback;
    throw new Error(`testFakeRedis: borne de score non gérée « ${s} »`);
  }
  // Tri par score croissant, puis par membre — ordre total déterministe, comme
  // Redis qui départage les scores égaux lexicographiquement.
  function sortedEntries(key) {
    return [...(zsets.get(key) || new Map()).entries()].sort(
      (a, b) => a[1] - b[1] || String(a[0]).localeCompare(String(b[0])),
    );
  }

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

    // — Sorted sets : index globaux datés (src/lib/indexes.js) —
    // Signature Upstash : zadd(key, {score, member}, ...pairs).
    async zadd(key, ...args) {
      const z = zsets.get(key) || new Map();
      let added = 0;
      // Le 1er argument peut être un objet d'options (nx, xx…) ; on ne les
      // implémente pas, mais on ne doit pas le confondre avec une paire.
      for (const pair of args) {
        if (!pair || typeof pair !== "object" || !("member" in pair)) continue;
        if (!z.has(pair.member)) added++;
        z.set(pair.member, Number(pair.score));
      }
      zsets.set(key, z);
      return added;
    },
    async zrange(key, min, max, opts) {
      let entries = sortedEntries(key);
      if (opts?.byScore) {
        const lo = scoreBound(min, -Infinity);
        const hi = scoreBound(max, Infinity);
        entries = entries.filter(([, s]) => s >= lo && s <= hi);
        if (opts.rev) entries.reverse();
      } else {
        // Indices de rang : `rev` s'applique AVANT le découpage, comme Redis.
        if (opts?.rev) entries.reverse();
        entries = entries.slice(Number(min), end(entries, Number(max)));
      }
      if (opts?.offset != null || opts?.count != null) {
        const off = Number(opts.offset) || 0;
        const cnt = Number(opts.count);
        entries = entries.slice(off, cnt >= 0 ? off + cnt : undefined);
      }
      return opts?.withScores
        ? entries.flatMap(([m, s]) => [clone(m), s])
        : entries.map(([m]) => clone(m));
    },
    async zcard(key) {
      return (zsets.get(key) || new Map()).size;
    },
    async zcount(key, min, max) {
      const lo = scoreBound(min, -Infinity);
      const hi = scoreBound(max, Infinity);
      return sortedEntries(key).filter(([, s]) => s >= lo && s <= hi).length;
    },
    async zscore(key, member) {
      const z = zsets.get(key);
      return z && z.has(member) ? z.get(member) : null;
    },
    async zrem(key, ...members) {
      const z = zsets.get(key);
      if (!z) return 0;
      let removed = 0;
      for (const m of members.flat()) if (z.delete(m)) removed++;
      return removed;
    },
  };
}

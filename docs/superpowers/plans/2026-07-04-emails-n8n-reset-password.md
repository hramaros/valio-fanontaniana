# Emails transactionnels (n8n) + réinitialisation de mot de passe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Déclencher trois emails via un workflow n8n (confirmation d'inscription manuelle, bienvenue Google, réinitialisation de mot de passe) et livrer un système de reset de mot de passe complet (token à usage unique, page dédiée, révocation optionnelle des autres sessions).

**Architecture:** Un module pur `src/lib/notify.js` déclenche un webhook n8n générique (`{ event, ...payload }`) sans jamais faire échouer l'action métier qui l'appelle. `src/lib/accounts.js` gagne des primitives Redis pour le token de reset (hash SHA-256, `GETDEL` atomique, TTL 1h) et un index `sessionsByAccount` pour la révocation optionnelle. Les routes API restent de fins wrappers (pattern déjà en place). Le workflow n8n est construit et publié via les outils MCP n8n dédiés.

**Tech Stack:** Next.js 15 (App Router, route handlers Node), Upstash Redis (`@upstash/redis`), `node:crypto`, `node:test`, n8n (Webhook Trigger, IF, Switch, Edit Fields, Gmail).

## Global Constraints

- Aucune nouvelle dépendance npm (tout avec `node:crypto`/`fetch` natifs).
- `notify()` ne doit **jamais** lever ni bloquer l'appelant au-delà de ~3s (timeout via `AbortController`).
- Le token de reset n'est **jamais** stocké en clair dans Redis — seul son hash SHA-256.
- Réponse anti-énumération : `POST /api/auth/password-reset/request` répond toujours `{ ok: true }`, qu'un compte existe ou non pour l'email fourni.
- TTL du token de reset : **3600s (1h)**.
- Tests : `npm test` (= `node --test "src/**/*.test.js"`). Build : `npm run build`. Les deux doivent rester verts après chaque tâche.
- Commits atomiques, un par tâche, messages en français au style du repo (voir `git log`).

---

### Task 1: Étendre le faux Redis de test (`getdel`, `srem`)

**Files:**
- Modify: `src/lib/testFakeRedis.js`

**Interfaces:**
- Produces: `createFakeRedis()` expose désormais aussi `getdel(key) -> value|null` (lit puis supprime atomiquement, comme `GETDEL` d'Upstash) et `srem(key, ...members) -> number` (retire des membres d'un set, retourne le nombre effectivement retiré).

- [ ] **Step 1: Ajouter `getdel` et `srem` au faux Redis**

Dans `src/lib/testFakeRedis.js`, ajouter ces deux méthodes à l'objet retourné par `createFakeRedis()` (juste après `del`, et juste après `smembers`) :

```js
    async getdel(key) {
      const v = store.has(key) ? clone(store.get(key)) : null;
      store.delete(key);
      return v;
    },
```

```js
    async srem(key, ...members) {
      const s = sets.get(key);
      if (!s) return 0;
      let removed = 0;
      for (const m of members.flat()) {
        if (s.delete(m)) removed++;
      }
      return removed;
    },
```

- [ ] **Step 2: Vérifier manuellement le comportement**

Run:
```bash
node --input-type=module -e "
import { createFakeRedis } from './src/lib/testFakeRedis.js';
const r = createFakeRedis();
await r.set('k', 'v');
console.log('getdel 1er appel:', await r.getdel('k'));
console.log('getdel 2e appel (doit être null):', await r.getdel('k'));
await r.sadd('s', 'a', 'b', 'c');
console.log('srem b:', await r.srem('s', 'b'));
console.log('smembers restants:', await r.smembers('s'));
"
```
Expected:
```
getdel 1er appel: v
getdel 2e appel (doit être null): null
srem b: 1
smembers restants: [ 'a', 'c' ]
```

- [ ] **Step 3: Suite de tests existante toujours verte**

Run: `npm test`
Expected: `76 pass` (aucune régression, ce fichier n'est pas encore consommé par du nouveau code).

- [ ] **Step 4: Commit**

```bash
git add src/lib/testFakeRedis.js
git commit -m "test: ajoute getdel/srem au faux Redis partagé"
```

---

### Task 2: `src/lib/notify.js` — déclenchement du webhook n8n

**Files:**
- Create: `src/lib/notify.js`
- Create: `src/lib/notify.test.js`

**Interfaces:**
- Produces: `notify(event, payload, options?) -> Promise<void>` où `event` est une chaîne (`"account_created" | "google_welcome" | "password_reset"`), `payload` un objet JSON-sérialisable, `options.timeoutMs` un override optionnel du timeout (défaut 3000, utilisé par les tests pour rester rapides). Ne lève jamais.
- Consumes: `process.env.N8N_WEBHOOK_URL`, `process.env.N8N_WEBHOOK_SECRET` (optionnel).

- [ ] **Step 1: Écrire les tests (ils doivent échouer, le module n'existe pas encore)**

Créer `src/lib/notify.test.js` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { notify } from "./notify.js";

function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    process.env[k] = vars[k];
  }
  return fn().finally(() => {
    for (const k of Object.keys(vars)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });
}

function withFetch(fakeFetch, fn) {
  const prev = globalThis.fetch;
  globalThis.fetch = fakeFetch;
  return fn().finally(() => {
    globalThis.fetch = prev;
  });
}

test("notify : POST vers N8N_WEBHOOK_URL avec event + payload + secret", async () => {
  let captured = null;
  await withFetch(
    async (url, opts) => {
      captured = { url, opts };
      return { ok: true };
    },
    () =>
      withEnv(
        { N8N_WEBHOOK_URL: "https://n8n.example.com/webhook/valio-notify", N8N_WEBHOOK_SECRET: "s3cr3t" },
        () => notify("account_created", { email: "p@e.mg", name: "Prof" }),
      ),
  );
  assert.equal(captured.url, "https://n8n.example.com/webhook/valio-notify");
  assert.equal(captured.opts.method, "POST");
  assert.equal(captured.opts.headers["x-valio-secret"], "s3cr3t");
  assert.equal(captured.opts.headers["content-type"], "application/json");
  const body = JSON.parse(captured.opts.body);
  assert.deepEqual(body, { event: "account_created", email: "p@e.mg", name: "Prof" });
});

test("notify : n'échoue jamais si fetch rejette (erreur réseau)", async () => {
  await withFetch(
    async () => {
      throw new Error("network down");
    },
    () =>
      withEnv({ N8N_WEBHOOK_URL: "https://n8n.example.com/webhook/x" }, () =>
        assert.doesNotReject(notify("password_reset", { email: "a@b.mg" })),
      ),
  );
});

test("notify : n'attend pas indéfiniment si l'appel est trop lent (timeout)", async () => {
  await withFetch(
    (url, opts) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      }),
    () =>
      withEnv({ N8N_WEBHOOK_URL: "https://n8n.example.com/webhook/x" }, async () => {
        const start = Date.now();
        await notify("account_created", { email: "a@b.mg" }, { timeoutMs: 50 });
        assert.ok(Date.now() - start < 500, "doit s'arrêter peu après le timeout, pas attendre indéfiniment");
      }),
  );
});

test("notify : sans N8N_WEBHOOK_URL configurée, ne tente aucun appel et ne lève pas", async () => {
  let called = false;
  await withFetch(
    async () => {
      called = true;
      return { ok: true };
    },
    () => withEnv({ N8N_WEBHOOK_URL: "" }, () => notify("account_created", { email: "a@b.mg" })),
  );
  assert.equal(called, false);
});
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `node --test src/lib/notify.test.js`
Expected: FAIL — `Cannot find module './notify.js'`

- [ ] **Step 3: Implémenter `src/lib/notify.js`**

```js
const DEFAULT_TIMEOUT_MS = 3000;

/**
 * Déclenche un événement de notification (email transactionnel) via le
 * webhook n8n générique. N'échoue jamais : les erreurs (réseau, timeout,
 * statut non-2xx, webhook non configuré) sont journalisées et avalées —
 * l'inscription, la connexion Google et le reset de mot de passe doivent
 * toujours réussir indépendamment du sort de l'email.
 *
 * `options.timeoutMs` est un override interne réservé aux tests ; en
 * production le timeout par défaut (3s) s'applique toujours.
 */
export async function notify(event, payload, options = {}) {
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) {
    console.error(`notify: N8N_WEBHOOK_URL non configurée, événement "${event}" ignoré.`);
    return;
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const secret = process.env.N8N_WEBHOOK_SECRET;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-valio-secret": secret } : {}),
      },
      body: JSON.stringify({ event, ...payload }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`notify: le webhook n8n a répondu ${res.status} pour l'événement "${event}".`);
    }
  } catch (err) {
    console.error(`notify: échec de l'envoi de l'événement "${event}" :`, err?.message || err);
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `node --test src/lib/notify.test.js`
Expected: `4 pass`

- [ ] **Step 5: Suite complète verte**

Run: `npm test`
Expected: `80 pass` (76 existants + 4 nouveaux)

- [ ] **Step 6: Commit**

```bash
git add src/lib/notify.js src/lib/notify.test.js
git commit -m "feat: notify() déclenche le webhook n8n (email transactionnel)"
```

---

### Task 3: `accounts.js` — index de sessions actives + révocation

**Files:**
- Modify: `src/lib/accounts.js:11` (ajout d'une clé), `src/lib/accounts.js:105-124` (`createSession`/`deleteSession`), fin de fichier (nouvelle fonction)
- Modify: `src/lib/accounts.test.js`

**Interfaces:**
- Consumes: `getRedis()` (`src/lib/redis.js`), `sadd`/`smembers`/`srem`/`expire`/`del`/`set`/`get` (déjà utilisés ou ajoutés en Task 1).
- Produces: `createSession(accountId)` (signature inchangée, effet de bord supplémentaire), `deleteSession(token)` (signature inchangée, effet de bord supplémentaire), `revokeOtherSessions(accountId, exceptToken) -> Promise<{ ok: true, revoked: number }>`.

- [ ] **Step 1: Écrire le test (doit échouer)**

Ajouter à `src/lib/accounts.test.js`, après le test `"credit/debit concurrents..."` :

```js
test("revokeOtherSessions : révoque les autres sessions, garde celle exceptée", async () => {
  setRedisClient(createFakeRedis());
  const { account } = await createAccount({ email: "multi@e.mg", password: "secret1" });
  const tokenA = await createSession(account.id);
  const tokenB = await createSession(account.id);
  const tokenC = await createSession(account.id);

  const res = await revokeOtherSessions(account.id, tokenC);
  assert.equal(res.ok, true);
  assert.equal(res.revoked, 2);

  assert.equal(await getAccountByToken(tokenA), null);
  assert.equal(await getAccountByToken(tokenB), null);
  assert.equal((await getAccountByToken(tokenC)).id, account.id);
});
```

Et ajouter `revokeOtherSessions` à l'import existant en haut du fichier :

```js
import {
  createAccount,
  authenticate,
  getAccountById,
  createSession,
  getAccountByToken,
  deleteSession,
  topupTest,
  debit,
  credit,
  getOrCreateByEmail,
  revokeOtherSessions,
} from "./accounts.js";
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `node --test src/lib/accounts.test.js`
Expected: FAIL — `revokeOtherSessions is not a function` (ou import `undefined`).

- [ ] **Step 3: Implémenter dans `src/lib/accounts.js`**

Ajouter la clé, juste après `const sessionKey = (token) => \`session:${token}\`;` (ligne 11) :

```js
const sessionsByAccountKey = (accountId) => `sessionsByAccount:${accountId}`;
```

Remplacer `createSession` (lignes 105-110) par :

```js
export async function createSession(accountId) {
  const redis = getRedis();
  const token = randomBytes(32).toString("hex");
  await redis.set(sessionKey(token), accountId, { ex: SESSION_TTL_SEC });
  await redis.sadd(sessionsByAccountKey(accountId), token);
  await redis.expire(sessionsByAccountKey(accountId), SESSION_TTL_SEC);
  return token;
}
```

Remplacer `deleteSession` (lignes 120-124) par :

```js
export async function deleteSession(token) {
  if (!token) return;
  const redis = getRedis();
  const accountId = await redis.get(sessionKey(token));
  await redis.del(sessionKey(token));
  if (accountId) await redis.srem(sessionsByAccountKey(accountId), token);
}
```

Ajouter, après `deleteSession` :

```js
/**
 * Révoque toutes les sessions actives d'un compte sauf `exceptToken` (utilisé
 * après un reset de mot de passe si l'utilisateur coche « se déconnecter des
 * autres appareils »). Best-effort : des tokens déjà expirés naturellement
 * dans l'index n'ont plus de clé `session:*` à supprimer, sans conséquence.
 */
export async function revokeOtherSessions(accountId, exceptToken) {
  const redis = getRedis();
  const tokens = await redis.smembers(sessionsByAccountKey(accountId));
  const others = tokens.filter((t) => t !== exceptToken);
  for (const t of others) {
    await redis.del(sessionKey(t));
    await redis.srem(sessionsByAccountKey(accountId), t);
  }
  return { ok: true, revoked: others.length };
}
```

- [ ] **Step 4: Lancer le test, vérifier le succès**

Run: `node --test src/lib/accounts.test.js`
Expected: PASS (tous les tests du fichier, y compris le nouveau)

- [ ] **Step 5: Suite complète verte**

Run: `npm test`
Expected: `81 pass`

- [ ] **Step 6: Commit**

```bash
git add src/lib/accounts.js src/lib/accounts.test.js
git commit -m "feat: index sessionsByAccount + revokeOtherSessions"
```

---

### Task 4: `accounts.js` — primitives de reset de mot de passe

**Files:**
- Modify: `src/lib/accounts.js:4` (import), fin de fichier (nouvelles fonctions)
- Modify: `src/lib/accounts.test.js`

**Interfaces:**
- Consumes: `getdel` (Task 1), `hashPassword` (déjà défini dans `accounts.js`).
- Produces: `getAccountByEmail(email) -> Promise<PublicAccount|null>`, `createPasswordResetToken(accountId) -> Promise<string>` (token brut), `consumePasswordResetToken(token) -> Promise<string|null>` (accountId ou null si invalide/expiré/déjà utilisé), `setPassword(accountId, newPassword) -> Promise<{ok:true}|{ok:false,status,error}>`.

- [ ] **Step 1: Écrire les tests (doivent échouer)**

Ajouter à `src/lib/accounts.test.js` :

```js
test("getAccountByEmail : trouve un compte existant, null sinon", async () => {
  setRedisClient(createFakeRedis());
  await createAccount({ email: "p@e.mg", password: "secret1", name: "Prof" });
  assert.equal((await getAccountByEmail("P@E.mg")).email, "p@e.mg");
  assert.equal(await getAccountByEmail("absent@e.mg"), null);
});

test("createPasswordResetToken + consumePasswordResetToken : usage unique", async () => {
  setRedisClient(createFakeRedis());
  const { account } = await createAccount({ email: "p@e.mg", password: "secret1" });
  const token = await createPasswordResetToken(account.id);
  assert.equal(typeof token, "string");
  assert.ok(token.length > 20);

  const firstUse = await consumePasswordResetToken(token);
  assert.equal(firstUse, account.id);

  const secondUse = await consumePasswordResetToken(token);
  assert.equal(secondUse, null, "un token déjà consommé ne doit plus fonctionner");
});

test("consumePasswordResetToken : token inconnu ou vide → null", async () => {
  setRedisClient(createFakeRedis());
  assert.equal(await consumePasswordResetToken("inconnu"), null);
  assert.equal(await consumePasswordResetToken(""), null);
});

test("setPassword : remplace le mot de passe (compte normal et compte Google-only)", async () => {
  setRedisClient(createFakeRedis());
  const { account } = await createAccount({ email: "p@e.mg", password: "secret1" });
  const res = await setPassword(account.id, "nouveaumdp");
  assert.equal(res.ok, true);
  assert.equal((await authenticate({ email: "p@e.mg", password: "nouveaumdp" })).ok, true);
  assert.equal((await authenticate({ email: "p@e.mg", password: "secret1" })).ok, false);

  const g = await getOrCreateByEmail({ email: "g@gmail.com", name: "G" });
  const res2 = await setPassword(g.account.id, "premiermdp");
  assert.equal(res2.ok, true);
  assert.equal((await authenticate({ email: "g@gmail.com", password: "premiermdp" })).ok, true);

  const tooShort = await setPassword(account.id, "abc");
  assert.equal(tooShort.ok, false);
  assert.equal(tooShort.status, 400);
});
```

Étendre l'import en haut de `src/lib/accounts.test.js` :

```js
import {
  createAccount,
  authenticate,
  getAccountById,
  getAccountByEmail,
  createSession,
  getAccountByToken,
  deleteSession,
  topupTest,
  debit,
  credit,
  getOrCreateByEmail,
  revokeOtherSessions,
  createPasswordResetToken,
  consumePasswordResetToken,
  setPassword,
} from "./accounts.js";
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `node --test src/lib/accounts.test.js`
Expected: FAIL — `getAccountByEmail is not a function` (et les autres nouvelles fonctions absentes).

- [ ] **Step 3: Implémenter dans `src/lib/accounts.js`**

Modifier la ligne d'import (ligne 4) :

```js
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
```

Ajouter, juste après `getAccountById` :

```js
export async function getAccountByEmail(email) {
  const redis = getRedis();
  const id = await redis.get(emailKey(normEmail(email)));
  if (!id) return null;
  return getAccountById(id);
}
```

Ajouter, à la fin du fichier (après `debit`) :

```js
// Reset de mot de passe : token à usage unique (hash SHA-256 en clé Redis,
// jamais le token brut), TTL 1h, consommé atomiquement (GETDEL) pour éviter
// toute fenêtre de course entre lecture et suppression.
const PASSWORD_RESET_TTL_SEC = 3600;
const passwordResetKey = (tokenHash) => `passwordReset:${tokenHash}`;
const hashResetToken = (token) => createHash("sha256").update(String(token)).digest("hex");

export async function createPasswordResetToken(accountId) {
  const redis = getRedis();
  const token = randomBytes(32).toString("hex");
  await redis.set(passwordResetKey(hashResetToken(token)), accountId, {
    ex: PASSWORD_RESET_TTL_SEC,
  });
  return token;
}

export async function consumePasswordResetToken(token) {
  if (!token) return null;
  const redis = getRedis();
  const accountId = await redis.getdel(passwordResetKey(hashResetToken(token)));
  return accountId || null;
}

/** Définit/remplace le mot de passe d'un compte (fonctionne aussi pour un
 * compte Google-only dont `passwordHash` est `null`, pour lui permettre de
 * définir un premier mot de passe via le reset). */
export async function setPassword(accountId, newPassword) {
  if (!newPassword || String(newPassword).length < 6)
    return { ok: false, status: 400, error: "Mot de passe : 6 caractères minimum." };
  const redis = getRedis();
  const account = await redis.get(accountKey(accountId));
  if (!account) return { ok: false, status: 404, error: "Compte introuvable." };
  account.passwordHash = hashPassword(newPassword);
  await redis.set(accountKey(accountId), account);
  return { ok: true };
}
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `node --test src/lib/accounts.test.js`
Expected: PASS (tous les tests du fichier)

- [ ] **Step 5: Suite complète verte**

Run: `npm test`
Expected: `85 pass`

- [ ] **Step 6: Commit**

```bash
git add src/lib/accounts.js src/lib/accounts.test.js
git commit -m "feat: primitives de reset de mot de passe (token GETDEL, setPassword)"
```

---

### Task 5: `getOrCreateByEmail` expose `created`

**Files:**
- Modify: `src/lib/accounts.js:63-88`
- Modify: `src/lib/accounts.test.js`

**Interfaces:**
- Produces: `getOrCreateByEmail({email,name,provider}) -> { ok:true, account, created: boolean } | { ok:false, error }` (ajout du champ `created`, le reste inchangé — tous les appelants existants qui ignorent `created` continuent de fonctionner).

- [ ] **Step 1: Étendre le test existant (doit échouer sur les nouvelles assertions)**

Remplacer le test `"getOrCreateByEmail : crée un compte Google puis le réutilise (pas de doublon)"` dans `src/lib/accounts.test.js` par :

```js
test("getOrCreateByEmail : crée un compte Google puis le réutilise (pas de doublon)", async () => {
  setRedisClient(createFakeRedis());
  const r1 = await getOrCreateByEmail({ email: "Prof@Gmail.com", name: "Prof G" });
  assert.equal(r1.ok, true);
  assert.equal(r1.account.email, "prof@gmail.com");
  assert.equal(r1.account.balanceAr, 0);
  assert.equal(r1.created, true, "premier appel = création");

  const r2 = await getOrCreateByEmail({ email: "prof@gmail.com", name: "Autre" });
  assert.equal(r2.account.id, r1.account.id);
  assert.equal(r2.created, false, "second appel = réutilisation, pas de nouveau compte");
});
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `node --test src/lib/accounts.test.js`
Expected: FAIL — `r1.created` est `undefined`, pas `true`.

- [ ] **Step 3: Implémenter dans `src/lib/accounts.js`**

Remplacer `getOrCreateByEmail` (lignes 63-88) par :

```js
export async function getOrCreateByEmail({ email, name, provider = "google" }) {
  const redis = getRedis();
  const e = normEmail(email);
  if (!e || !/.+@.+\..+/.test(e))
    return { ok: false, error: "Email Google invalide." };

  const existingId = await redis.get(emailKey(e));
  if (existingId) {
    const acc = await redis.get(accountKey(existingId));
    if (acc) return { ok: true, account: publicAccount(acc), created: false };
  }

  const id = generateId("acc");
  const account = {
    id,
    email: e,
    name: String(name || "").trim().slice(0, 60) || e.split("@")[0],
    passwordHash: null,
    provider,
    balanceAr: 0,
    createdAt: Date.now(),
  };
  await redis.set(accountKey(id), account);
  await redis.set(emailKey(e), id);
  return { ok: true, account: publicAccount(account), created: true };
}
```

- [ ] **Step 4: Lancer le test, vérifier le succès**

Run: `node --test src/lib/accounts.test.js`
Expected: PASS

- [ ] **Step 5: Suite complète verte**

Run: `npm test`
Expected: `85 pass` (même total qu'avant — ce test remplace un test existant, n'en ajoute pas)

- [ ] **Step 6: Commit**

```bash
git add src/lib/accounts.js src/lib/accounts.test.js
git commit -m "feat: getOrCreateByEmail expose created (création vs réutilisation)"
```

---

### Task 6: Déclencher `notify()` depuis signup et Google callback

**Files:**
- Modify: `src/app/api/auth/signup/route.js`
- Modify: `src/app/api/auth/google/callback/route.js`

**Interfaces:**
- Consumes: `notify(event, payload)` (Task 2), `res.created` de `getOrCreateByEmail` (Task 5).

Pas de test automatisé dédié pour cette tâche : ce sont des routes fines qui appellent déjà des fonctions testées (`notify`, `getOrCreateByEmail`) ; la vérification se fait par lecture du code + build + test manuel (Task 12 couvre la vérification finale). C'est cohérent avec le reste du projet, où les routes ne sont pas testées unitairement (seule la logique dans `src/lib/*.js` l'est).

- [ ] **Step 1: Modifier `src/app/api/auth/signup/route.js`**

Remplacer le contenu du fichier par :

```js
import { createAccount, createSession } from "@/lib/accounts";
import { sessionSetCookie } from "@/lib/authServer";
import { notify } from "@/lib/notify";
import { readBody, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = handler(async (request) => {
  const { email, password, name } = await readBody(request);
  const res = await createAccount({ email, password, name });
  if (!res.ok)
    return Response.json({ error: res.error }, { status: res.status || 400 });
  await notify("account_created", { email: res.account.email, name: res.account.name });
  const token = await createSession(res.account.id);
  return new Response(JSON.stringify({ account: res.account }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": sessionSetCookie(token),
    },
  });
});
```

- [ ] **Step 2: Modifier `src/app/api/auth/google/callback/route.js`**

Ajouter l'import en haut du fichier :

```js
import { getOrCreateByEmail, createSession } from "@/lib/accounts";
import { sessionSetCookie } from "@/lib/authServer";
import { notify } from "@/lib/notify";
```

Remplacer le bloc :

```js
    const res = await getOrCreateByEmail({
      email: info.email,
      name: info.name,
      provider: "google",
    });
    if (!res.ok) return redirect(origin, "/host?authError=google");

    const token = await createSession(res.account.id);
```

par :

```js
    const res = await getOrCreateByEmail({
      email: info.email,
      name: info.name,
      provider: "google",
    });
    if (!res.ok) return redirect(origin, "/host?authError=google");

    if (res.created) {
      await notify("google_welcome", { email: res.account.email, name: res.account.name });
    }

    const token = await createSession(res.account.id);
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build réussit sans erreur.

- [ ] **Step 4: Suite complète verte**

Run: `npm test`
Expected: `85 pass` (aucun nouveau test dans cette tâche, mais aucune régression)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/signup/route.js src/app/api/auth/google/callback/route.js
git commit -m "feat: déclenche notify() à l'inscription manuelle et au premier login Google"
```

---

### Task 7: Routes API de reset de mot de passe

**Files:**
- Create: `src/app/api/auth/password-reset/request/route.js`
- Create: `src/app/api/auth/password-reset/confirm/route.js`

**Interfaces:**
- Consumes: `getAccountByEmail`, `createPasswordResetToken`, `consumePasswordResetToken`, `setPassword`, `createSession`, `revokeOtherSessions`, `getAccountById` (toutes de `src/lib/accounts.js`), `notify` (`src/lib/notify.js`), `sessionSetCookie` (`src/lib/authServer.js`), `readBody`/`json`/`handler` (`src/lib/http.js`).

Pas de test automatisé dédié (routes fines sur des fonctions déjà testées, cf. Task 6) — vérifié manuellement en Task 12.

- [ ] **Step 1: Créer `src/app/api/auth/password-reset/request/route.js`**

```js
import { getAccountByEmail, createPasswordResetToken } from "@/lib/accounts";
import { notify } from "@/lib/notify";
import { readBody, json, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

// Anti-énumération : toujours la même réponse, qu'un compte existe ou non.
export const POST = handler(async (request) => {
  const { email } = await readBody(request);
  const account = await getAccountByEmail(email);
  if (account) {
    const token = await createPasswordResetToken(account.id);
    const origin = new URL(request.url).origin;
    const resetLink = `${origin}/reset-password?token=${token}`;
    await notify("password_reset", {
      email: account.email,
      name: account.name,
      resetLink,
      expiresInMinutes: 60,
    });
  }
  return json({ ok: true });
});
```

- [ ] **Step 2: Créer `src/app/api/auth/password-reset/confirm/route.js`**

```js
import {
  consumePasswordResetToken,
  setPassword,
  createSession,
  revokeOtherSessions,
  getAccountById,
} from "@/lib/accounts";
import { sessionSetCookie } from "@/lib/authServer";
import { readBody, json, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = handler(async (request) => {
  const { token, password, revokeOtherSessions: shouldRevokeOthers } = await readBody(request);

  const accountId = await consumePasswordResetToken(token);
  if (!accountId) return json({ error: "Lien invalide ou expiré." }, 400);

  const res = await setPassword(accountId, password);
  if (!res.ok) return json({ error: res.error }, res.status || 400);

  const newToken = await createSession(accountId);
  if (shouldRevokeOthers) await revokeOtherSessions(accountId, newToken);

  const account = await getAccountById(accountId);
  return new Response(JSON.stringify({ account }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": sessionSetCookie(newToken),
    },
  });
});
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build réussit, les deux nouvelles routes apparaissent dans la sortie (`ƒ /api/auth/password-reset/request`, `ƒ /api/auth/password-reset/confirm`).

- [ ] **Step 4: Suite complète verte**

Run: `npm test`
Expected: `85 pass`

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/password-reset/request/route.js src/app/api/auth/password-reset/confirm/route.js
git commit -m "feat: routes API de demande et confirmation de reset de mot de passe"
```

---

### Task 8: `AuthModal.jsx` — lien « Mot de passe oublié ? »

**Files:**
- Modify: `src/components/AuthModal.jsx` (remplacement complet du fichier)

**Interfaces:**
- Consumes: `apiPost("/api/auth/password-reset/request", {email})` (Task 7).

- [ ] **Step 1: Remplacer le contenu de `src/components/AuthModal.jsx`**

```jsx
"use client";
import { useState } from "react";
import { apiPost } from "@/lib/api";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";

const linkButtonStyle = {
  background: "none",
  border: "none",
  color: "var(--accent-bright)",
  textDecoration: "underline",
  cursor: "pointer",
  padding: 0,
  font: "inherit",
};

// Modale connexion / inscription du formateur (requise pour le mode Examen).
export default function AuthModal({ onClose, onAuthed }) {
  const [tab, setTab] = useState("login"); // login | signup | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "1";

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const url = tab === "login" ? "/api/auth/login" : "/api/auth/signup";
    const body = tab === "login" ? { email, password } : { email, password, name };
    const { ok, data } = await apiPost(url, body);
    setBusy(false);
    if (!ok) {
      setError(data?.error || "Échec de l'opération.");
      return;
    }
    onAuthed(data.account);
  }

  async function submitForgot(e) {
    e.preventDefault();
    setBusy(true);
    await apiPost("/api/auth/password-reset/request", { email });
    setBusy(false);
    setForgotSent(true);
  }

  function backToLogin() {
    setTab("login");
    setForgotSent(false);
    setError("");
  }

  if (tab === "forgot") {
    return (
      <Modal onClose={onClose} labelledBy="auth-title">
        <div className="row row--between">
          <h2 id="auth-title" style={{ fontSize: "1.4rem" }}>
            Mot de passe oublié
          </h2>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={onClose}
            aria-label="Fermer"
          >
            <Icon name="close" />
          </button>
        </div>

        {forgotSent ? (
          <p className="muted" style={{ textAlign: "center" }}>
            Si un compte existe pour cet email, un lien de réinitialisation
            vient d'être envoyé. Vérifiez votre boîte de réception.
          </p>
        ) : (
          <form className="stack gap-12" onSubmit={submitForgot}>
            <p className="tiny muted">
              Indiquez votre email : si un compte existe, vous recevrez un
              lien pour choisir un nouveau mot de passe.
            </p>
            <div>
              <label className="label" htmlFor="forgot-email">
                Email
              </label>
              <input
                id="forgot-email"
                className="input"
                type="email"
                placeholder="vous@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="btn btn--primary btn--lg btn--block"
              disabled={busy || !email.trim()}
            >
              {busy ? "…" : "Envoyer le lien"}
            </button>
          </form>
        )}

        <p className="tiny muted" style={{ textAlign: "center" }}>
          <button type="button" style={linkButtonStyle} onClick={backToLogin}>
            Retour à la connexion
          </button>
        </p>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} labelledBy="auth-title">
      <div className="row row--between">
        <div className="seg" role="group" aria-label="Connexion ou inscription">
          <button
            type="button"
            aria-pressed={tab === "login"}
            onClick={() => setTab("login")}
          >
            Connexion
          </button>
          <button
            type="button"
            aria-pressed={tab === "signup"}
            onClick={() => setTab("signup")}
          >
            Inscription
          </button>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={onClose}
          aria-label="Fermer"
        >
          <Icon name="close" />
        </button>
      </div>

      <div className="stack gap-8" style={{ textAlign: "center" }}>
        <h2 id="auth-title" style={{ fontSize: "1.4rem" }}>
          {tab === "login" ? "Se connecter" : "Créer un compte formateur"}
        </h2>
        <p className="tiny muted">Requis pour lancer un examen (mode payant).</p>
      </div>

      {googleEnabled && (
        <>
          <button
            type="button"
            className="btn btn--ghost btn--block"
            onClick={() => {
              window.location.href = "/api/auth/google";
            }}
          >
            Continuer avec Google
          </button>
          <div className="divider-or">ou</div>
        </>
      )}

      <form className="stack gap-12" onSubmit={submit}>
        {tab === "signup" && (
          <div>
            <label className="label" htmlFor="auth-name">
              Votre nom
            </label>
            <input
              id="auth-name"
              className="input"
              placeholder="ex. M. Rakoto"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoComplete="name"
            />
          </div>
        )}
        <div>
          <label className="label" htmlFor="auth-email">
            Email
          </label>
          <input
            id="auth-email"
            className="input"
            type="email"
            placeholder="vous@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
          />
        </div>
        <div>
          <label className="label" htmlFor="auth-password">
            Mot de passe{tab === "signup" ? " (6 caractères min.)" : ""}
          </label>
          <input
            id="auth-password"
            className="input"
            type="password"
            placeholder="••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={tab === "login" ? "current-password" : "new-password"}
          />
        </div>
        {tab === "login" && (
          <button
            type="button"
            style={{ ...linkButtonStyle, textAlign: "left" }}
            onClick={() => setTab("forgot")}
          >
            Mot de passe oublié ?
          </button>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button
          type="submit"
          className="btn btn--primary btn--lg btn--block"
          disabled={busy}
        >
          {busy ? "…" : tab === "login" ? "Connexion" : "Créer le compte"}
        </button>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build réussit sans erreur (aucun changement de props publiques du composant : `AuthModal({ onClose, onAuthed })` inchangé).

- [ ] **Step 3: Vérification visuelle (headless)**

Démarrer le serveur de dev et vérifier que la modale s'ouvre toujours normalement (l'app nécessite Redis configuré pour les appels réels, mais l'ouverture/fermeture de la modale et la bascule d'onglets sont purement côté client) :

```bash
npm run dev &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
```
Expected: `200`

- [ ] **Step 4: Commit**

```bash
git add src/components/AuthModal.jsx
git commit -m "feat(ui): lien mot de passe oublié dans AuthModal"
```

---

### Task 9: Page `/reset-password`

**Files:**
- Create: `src/app/reset-password/page.jsx`

**Interfaces:**
- Consumes: `apiPost("/api/auth/password-reset/confirm", {token, password, revokeOtherSessions})` (Task 7).

- [ ] **Step 1: Créer `src/app/reset-password/page.jsx`**

```jsx
"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Brand from "@/components/Brand";
import Icon from "@/components/Icon";
import { apiPost } from "@/lib/api";

function ResetPasswordInner() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [revoke, setRevoke] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Mot de passe : 6 caractères minimum.");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    const { ok, data } = await apiPost("/api/auth/password-reset/confirm", {
      token,
      password,
      revokeOtherSessions: revoke,
    });
    setBusy(false);
    if (!ok) {
      setError(data?.error || "Lien invalide ou expiré.");
      return;
    }
    setDone(true);
    window.setTimeout(() => {
      window.location.href = "/host";
    }, 1200);
  }

  if (!token) {
    return (
      <div className="center-screen">
        <div
          className="container container--narrow stack gap-16"
          style={{ textAlign: "center" }}
        >
          <div className="row row--between">
            <Brand as="span" />
          </div>
          <h1 style={{ fontSize: "1.8rem" }}>Lien invalide</h1>
          <p className="muted">
            Ce lien de réinitialisation est incomplet. Redemandez un lien
            depuis la connexion (« Mot de passe oublié ? »).
          </p>
          <Link href="/" className="btn btn--primary">
            Retour à l'accueil
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="center-screen">
        <div
          className="container container--narrow stack gap-16"
          style={{ textAlign: "center" }}
        >
          <Brand as="span" />
          <h1 style={{ fontSize: "1.8rem" }}>Mot de passe mis à jour</h1>
          <p className="muted">Vous êtes connecté. Redirection…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="center-screen">
      <div className="container container--narrow stack gap-24">
        <div className="row row--between">
          <Brand as="span" />
        </div>

        <div className="stack gap-8">
          <span className="eyebrow">Réinitialisation</span>
          <h1 style={{ fontSize: "2rem" }}>Choisir un nouveau mot de passe</h1>
        </div>

        <form className="card stack gap-16" onSubmit={submit}>
          <div>
            <label className="label" htmlFor="reset-password">
              Nouveau mot de passe
            </label>
            <input
              id="reset-password"
              className="input"
              type="password"
              placeholder="•••••• (6 caractères min.)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="reset-password-confirm">
              Confirmer le mot de passe
            </label>
            <input
              id="reset-password-confirm"
              className="input"
              type="password"
              placeholder="••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={revoke}
              onChange={(e) => setRevoke(e.target.checked)}
            />
            Se déconnecter des autres appareils
          </label>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button
            type="submit"
            className="btn btn--primary btn--lg btn--block"
            disabled={busy}
          >
            {busy ? (
              "…"
            ) : (
              <>
                Réinitialiser <Icon name="arrowRight" size={18} />
              </>
            )}
          </button>
        </form>

        <p className="tiny muted" style={{ textAlign: "center" }}>
          <Link href="/">Retour à l'accueil</Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="center-screen">
          <div className="spin" role="status" aria-label="Chargement" />
        </div>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build réussit, `○ /reset-password` apparaît dans la sortie.

- [ ] **Step 3: Vérification visuelle (headless, sans token → état "lien invalide")**

```bash
npm run dev &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/reset-password"
```
Expected: `200`

- [ ] **Step 4: Commit**

```bash
git add src/app/reset-password/page.jsx
git commit -m "feat(ui): page /reset-password (saisie du nouveau mot de passe)"
```

---

### Task 10: Documenter les variables d'environnement

**Files:**
- Modify: `.env.local.example`

- [ ] **Step 1: Ajouter la section n8n**

Ajouter à la fin de `.env.local.example` :

```bash

# Webhook n8n (emails transactionnels : confirmation d'inscription, bienvenue
# Google, reset de mot de passe). Un seul webhook générique : le workflow n8n
# route sur le champ `event` du body JSON reçu (voir Task 11 du plan
# docs/superpowers/plans/2026-07-04-emails-n8n-reset-password.md).
# N8N_WEBHOOK_SECRET est un secret partagé arbitraire (ex. généré avec
# `openssl rand -hex 32`) : le workflow n8n doit le vérifier via le header
# `x-valio-secret` avant de traiter la requête.
N8N_WEBHOOK_URL=
N8N_WEBHOOK_SECRET=
```

- [ ] **Step 2: Commit**

```bash
git add .env.local.example
git commit -m "docs: documente N8N_WEBHOOK_URL/N8N_WEBHOOK_SECRET"
```

---

### Task 11: Construire et publier le workflow n8n

**Files:** Aucun fichier du repo (workflow créé dans l'instance n8n de l'utilisateur via les outils MCP).

**Prérequis :** Un identifiant Gmail (OAuth2) déjà configuré dans l'instance n8n cible (autorisation faite manuellement par l'utilisateur dans l'UI n8n — hors de portée des outils MCP).

**IMPORTANT :** Avant tout appel MCP n8n, invoquer le skill `n8n-skills:using-n8n-skills` puis `n8n-skills:n8n-workflow-lifecycle` (organisation/publication) et `n8n-skills:n8n-credentials-and-security` (vérification du secret partagé) — non optionnel, cf. règles du plugin n8n-skills.

- [ ] **Step 1: Lire la référence SDK et les nœuds suggérés**

Appeler `get_sdk_reference` (sections `guidelines` et `design`), puis `get_suggested_nodes` pour les catégories : déclencheur webhook, routage conditionnel, envoi d'email.

- [ ] **Step 2: Rechercher les nœuds exacts**

Appeler `search_nodes` avec les requêtes : `["webhook", "if", "switch", "set", "gmail", "respond to webhook"]`. Noter les discriminants (`resource`/`operation`) retournés, en particulier pour le nœud Gmail (`resource: message`, `operation: send`).

- [ ] **Step 3: Récupérer les définitions de types**

Appeler `get_node_types` avec tous les node IDs retenus à l'étape 2 (webhook trigger, IF, Switch, Set/Edit Fields, Gmail send, Respond to Webhook), discriminants inclus.

- [ ] **Step 4: Écrire le workflow avec le SDK**

Construire un workflow correspondant exactement à cette structure (les noms de nœuds/paramètres exacts dépendent de la syntaxe SDK retournée à l'étape 3, mais la logique et le contenu ci-dessous sont figés et ne doivent pas être réinterprétés) :

1. **Webhook Trigger** — méthode POST, chemin `valio-notify`.
2. **IF** — condition : le header `x-valio-secret` de la requête entrante est strictement égal à la valeur du secret partagé (stockée côté n8n en credential/variable d'environnement n8n, jamais en dur dans le node). Branche `false` → **Respond to Webhook** avec code 401 et corps `{ "error": "unauthorized" }`, fin de branche.
3. **Switch** sur `{{$json.body.event}}`, 3 branches exactes : `account_created`, `google_welcome`, `password_reset`. Une branche par défaut (`fallback`) → **Respond to Webhook** 400 `{ "error": "unknown event" }`.
4. Branche `account_created` : **Edit Fields** qui prépare :
   - `subject` = `"Bienvenue sur valio.fanontaniana"`
   - `body` = `"Bonjour {{ $json.body.name }},\n\nVotre compte formateur valio.fanontaniana a bien été créé avec l'adresse {{ $json.body.email }}.\n\nVous pouvez dès maintenant vous connecter et créer votre premier quiz.\n\n— L'équipe valio.fanontaniana"`

   puis **Gmail → Send Message** : `To` = `{{ $json.body.email }}`, `Subject` = `{{ $json.subject }}`, `Message` = `{{ $json.body }}` (texte brut, pas de HTML requis).
5. Branche `google_welcome` : **Edit Fields** :
   - `subject` = `"Bienvenue sur valio.fanontaniana"`
   - `body` = `"Bonjour {{ $json.body.name }},\n\nVotre compte formateur valio.fanontaniana a été créé via votre connexion Google ({{ $json.body.email }}).\n\nVous pouvez dès maintenant créer votre premier quiz.\n\n— L'équipe valio.fanontaniana"`

   puis **Gmail → Send Message** (mêmes champs que ci-dessus).
6. Branche `password_reset` : **Edit Fields** :
   - `subject` = `"Réinitialisation de votre mot de passe valio.fanontaniana"`
   - `body` = `"Bonjour {{ $json.body.name }},\n\nVous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le lien ci-dessous pour choisir un nouveau mot de passe (valable {{ $json.body.expiresInMinutes }} minutes) :\n\n{{ $json.body.resetLink }}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.\n\n— L'équipe valio.fanontaniana"`

   puis **Gmail → Send Message** (mêmes champs).
7. Chaque branche d'envoi termine par **Respond to Webhook** : `{ "ok": true }`.

- [ ] **Step 5: Valider**

Appeler `validate_workflow` avec le code complet. Corriger toute erreur signalée et revalider jusqu'à validation propre.

- [ ] **Step 6: Créer le workflow**

Appeler `create_workflow_from_code` avec le code validé, `description` : « Emails transactionnels valio.fanontaniana : confirmation d'inscription, bienvenue Google, reset de mot de passe. Déclenché par src/lib/notify.js. »

- [ ] **Step 7: Vérifier les connexions**

Appeler `get_workflow_details` sur le workflow créé, vérifier l'objet `connections` (chaque nœud correctement relié, les 3 branches du Switch bien distinctes, les branches d'erreur de l'IF bien câblées).

- [ ] **Step 8: Publier**

Appeler `publish_workflow`. Noter l'URL du webhook publié.

- [ ] **Step 9: Configurer les secrets dans Vercel**

Indiquer à l'utilisateur de définir, sur le projet Vercel (Production + Preview) :
- `N8N_WEBHOOK_URL` = URL du webhook publié (Step 8)
- `N8N_WEBHOOK_SECRET` = un secret généré (ex. `openssl rand -hex 32`), à reporter aussi côté n8n (credential/variable utilisée par le nœud IF de l'étape 2 du workflow).

(L'exécution de `vercel env add` reste à la charge de l'utilisateur ou d'une étape confirmée séparément — ne pas modifier les env vars Vercel sans confirmation explicite.)

---

### Task 12: Vérification finale

**Files:** Aucun (vérification uniquement).

- [ ] **Step 1: Suite de tests complète**

Run: `npm test`
Expected: `85 pass`, `0 fail`.

- [ ] **Step 2: Build complet**

Run: `npm run build`
Expected: build réussit, routes suivantes présentes dans la sortie : `ƒ /api/auth/password-reset/request`, `ƒ /api/auth/password-reset/confirm`, `○ /reset-password`.

- [ ] **Step 3: Vérification manuelle du flux (si Redis local disponible)**

Si `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` sont configurés en local : créer un compte via `/`, vérifier en base (ou logs `notify`) que l'événement `account_created` est bien déclenché ; demander un reset via la modale, suivre le lien `/reset-password?token=...` (récupéré depuis les logs si pas d'accès à la boîte mail de test), définir un nouveau mot de passe, vérifier la connexion automatique. Si Redis n'est pas configuré localement, documenter que cette étape a été sautée (cohérent avec les vérifications précédentes de ce projet).

- [ ] **Step 4: Récapitulatif**

Confirmer à l'utilisateur : nombre de tests (84), statut du build, URL du webhook n8n publié (Task 11), et rappeler qu'il doit configurer `N8N_WEBHOOK_URL`/`N8N_WEBHOOK_SECRET` sur Vercel avant que les emails partent réellement en production.

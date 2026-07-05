# Paiement Stripe + page portefeuille formateur — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le stub de recharge par un vrai paiement Stripe (Checkout Session + webhook signé), avec conversion EUR→Ariary au taux du jour, et ajouter une page `/host/wallet` accessible depuis la navigation formateur pour recharger et consulter l'historique.

**Architecture:** Un provider Stripe (`stripeProvider.js`) branché sur l'abstraction paiement provider-agnostique existante de `payments.js` (`{initiate, handleWebhook}`). La conversion Ariary→EUR passe par un module de taux de change (`fxRate.js`) avec repli en cascade (cache Redis → dernier taux connu → constante d'env). Le solde reste affiché et crédité en Ariary ; Stripe facture en EUR. Le crédit du solde n'a lieu que sur réception du webhook `checkout.session.completed` signé, via le `completeTransaction` idempotent déjà en place.

**Tech Stack:** Next.js 15 (App Router, route handlers Node), Upstash Redis (`@upstash/redis`), SDK officiel `stripe`, `node:test`, `fetch`/`AbortController` natifs.

## Global Constraints

- Nouvelle dépendance npm autorisée : `stripe` (SDK Node officiel). Aucune autre.
- Stripe facture en **EUR** ; le solde formateur reste en **Ariary (MGA)**.
- Le webhook Stripe vérifie la signature sur le **corps brut** (`request.text()`) — jamais `request.json()`. Aucun crédit sans signature valide.
- Idempotence du crédit déjà garantie par `completeTransaction` (`status === "completed"` → no-op) — ne pas la ré-implémenter.
- Repli du taux de change : cache Redis frais (TTL 6h) → dernier taux connu durable → constante `STRIPE_EUR_TO_AR_FALLBACK_RATE` (défaut 4800). Un paiement ne doit jamais échouer parce que l'API de change est indisponible.
- Montant de recharge borné côté route : **500 – 1 000 000 Ar**.
- Le provider `stub` reste enregistré (tests existants de `payments.test.js` en dépendent) ; il n'est simplement plus sélectionné par la route topup.
- Clés/secrets uniquement en variables d'environnement : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_EUR_TO_AR_FALLBACK_RATE`, `APP_BASE_URL`.
- Tests : `npm test` (= `node --test "src/**/*.test.js"`). Build : `npm run build`. Les deux restent verts après chaque tâche.
- Style repo : commentaires en français, commits atomiques au style du `git log` existant.

## File Structure

- **Create** `src/lib/fxRate.js` (+ `fxRate.test.js`) — taux EUR→Ariary, cache + repli. Pur I/O Redis + fetch.
- **Create** `src/lib/stripeProvider.js` (+ `stripeProvider.test.js`) — provider Stripe, s'auto-enregistre à l'import.
- **Modify** `src/lib/payments.js` (+ `payments.test.js`) — fusion `txnExtra`, index `txnHistory`, `listTransactions`.
- **Modify** `src/app/api/wallet/topup/route.js` — body `{amountAr}`, validation, provider `stripe`.
- **Create** `src/app/api/wallet/history/route.js` — liste des transactions du compte.
- **Modify** `src/app/api/wallet/webhook/[provider]/route.js` — import à effet de bord du provider Stripe.
- **Modify** `src/components/Icon.jsx` — icône `wallet`.
- **Modify** `src/components/HostShell.jsx` — entrée nav « Portefeuille ».
- **Create** `src/app/host/wallet/page.jsx` — interface portefeuille.
- **Modify** `src/components/RechargeModal.jsx` + `src/app/host/lobby/page.jsx` — lien vers `/host/wallet`.
- **Modify** `.env.local.example`, `package.json` — dépendance + variables d'env.

---

### Task 1: Dépendance Stripe + variables d'environnement

**Files:**
- Modify: `package.json`
- Modify: `.env.local.example`

**Interfaces:**
- Produces: le package `stripe` installé (importable par les tâches suivantes) ; les variables d'env documentées.

- [ ] **Step 1: Installer le SDK Stripe**

Run: `npm install stripe`
Expected: `package.json` gagne `"stripe": "^22.x"` dans `dependencies`, `npm install` se termine sans erreur.

- [ ] **Step 2: Vérifier l'import du package**

Run:
```bash
node --input-type=module -e "import Stripe from 'stripe'; console.log(typeof Stripe);"
```
Expected: `function`

- [ ] **Step 3: Documenter les variables d'environnement**

Ajouter à la fin de `.env.local.example` :

```bash

# Paiement Stripe (recharge du portefeuille formateur). Créez un compte Stripe
# (pays d'immatriculation supporté par Stripe — Madagascar ne l'est pas), puis
# récupérez la clé secrète (Dashboard > Developers > API keys) et le secret de
# signature du webhook (Developers > Webhooks > endpoint pointant vers
# /api/wallet/webhook/stripe). Stripe facture en EUR ; le solde reste affiché et
# crédité en Ariary via le taux de change du jour.
# STRIPE_EUR_TO_AR_FALLBACK_RATE : taux « Ariary par euro » utilisé en dernier
# recours si l'API de change ET le cache Redis sont indisponibles (ex. 4800).
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_EUR_TO_AR_FALLBACK_RATE=

# Origine publique de l'app, repli pour les URL de retour Stripe quand la requête
# ne fournit pas d'origine (ex. https://valio.fanontaniana.mg). En temps normal,
# l'origine est déduite de la requête entrante.
APP_BASE_URL=
```

- [ ] **Step 4: Suite de tests inchangée**

Run: `npm test`
Expected: `85 pass` (aucun code produit encore ; on vérifie juste qu'installer stripe ne casse rien).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.local.example
git commit -m "chore: dépendance stripe + variables d'env paiement"
```

---

### Task 2: Module de taux de change `fxRate.js`

**Files:**
- Create: `src/lib/fxRate.js`
- Create: `src/lib/fxRate.test.js`

**Interfaces:**
- Consumes: `getRedis()` (`src/lib/redis.js`), `setRedisClient()` + `createFakeRedis()` (tests), `globalThis.fetch`, `process.env.STRIPE_EUR_TO_AR_FALLBACK_RATE`.
- Produces: `getArPerEurRate(options?) -> Promise<number>` (Ariary pour 1 EUR ; `options.timeoutMs` override réservé aux tests).

- [ ] **Step 1: Écrire les tests (ils doivent échouer, le module n'existe pas)**

Créer `src/lib/fxRate.test.js` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { setRedisClient } from "./redis.js";
import { createFakeRedis } from "./testFakeRedis.js";
import { getArPerEurRate } from "./fxRate.js";

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

test("getArPerEurRate : cache Redis frais → pas d'appel réseau", async () => {
  const redis = createFakeRedis();
  await redis.set("fxRate:EUR:MGA", 5000);
  setRedisClient(redis);
  let called = false;
  await withFetch(
    async () => { called = true; return { ok: true, json: async () => ({}) }; },
    async () => {
      assert.equal(await getArPerEurRate(), 5000);
    },
  );
  assert.equal(called, false, "le cache frais évite l'appel réseau");
});

test("getArPerEurRate : sans cache → fetch en direct, met en cache + dernier connu", async () => {
  const redis = createFakeRedis();
  setRedisClient(redis);
  await withFetch(
    async () => ({ ok: true, json: async () => ({ rates: { MGA: 4900 } }) }),
    async () => {
      assert.equal(await getArPerEurRate(), 4900);
    },
  );
  assert.equal(await redis.get("fxRate:EUR:MGA"), 4900);
  assert.equal(await redis.get("fxRate:EUR:MGA:last"), 4900);
});

test("getArPerEurRate : fetch échoue → repli sur le dernier taux connu", async () => {
  const redis = createFakeRedis();
  await redis.set("fxRate:EUR:MGA:last", 4700);
  setRedisClient(redis);
  await withFetch(
    async () => { throw new Error("réseau down"); },
    async () => {
      assert.equal(await getArPerEurRate({ timeoutMs: 50 }), 4700);
    },
  );
});

test("getArPerEurRate : fetch échoue et aucun dernier taux → constante d'env", async () => {
  const redis = createFakeRedis();
  setRedisClient(redis);
  await withEnv({ STRIPE_EUR_TO_AR_FALLBACK_RATE: "5100" }, () =>
    withFetch(
      async () => { throw new Error("réseau down"); },
      async () => {
        assert.equal(await getArPerEurRate({ timeoutMs: 50 }), 5100);
      },
    ),
  );
});
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `node --test src/lib/fxRate.test.js`
Expected: FAIL — `Cannot find module './fxRate.js'`

- [ ] **Step 3: Implémenter `src/lib/fxRate.js`**

```js
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
  if (cached) return cached;

  try {
    const rate = await fetchLiveRate(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    await redis.set(CACHE_KEY, rate, { ex: CACHE_TTL_SEC });
    await redis.set(LAST_KEY, rate); // durable, mis à jour seulement sur succès
    return rate;
  } catch (err) {
    console.error("fxRate: taux en direct indisponible, repli :", err?.message || err);
    const last = await redis.get(LAST_KEY);
    if (last) return last;
    return Number(process.env.STRIPE_EUR_TO_AR_FALLBACK_RATE) || FALLBACK_RATE;
  }
}
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `node --test src/lib/fxRate.test.js`
Expected: `4 pass`

- [ ] **Step 5: Suite complète verte**

Run: `npm test`
Expected: `89 pass` (85 + 4)

- [ ] **Step 6: Commit**

```bash
git add src/lib/fxRate.js src/lib/fxRate.test.js
git commit -m "feat: module de taux de change EUR→Ariary (cache + repli)"
```

---

### Task 3: Provider Stripe `stripeProvider.js`

**Files:**
- Create: `src/lib/stripeProvider.js`
- Create: `src/lib/stripeProvider.test.js`

**Interfaces:**
- Consumes: `registerProvider` (`src/lib/payments.js`), `getArPerEurRate` (`src/lib/fxRate.js`, Task 2), `setRedisClient`/`createFakeRedis` (tests), SDK `stripe`.
- Produces: `setStripeClient(client)` (injection tests), `getStripeClient()`, `stripeProvider` = `{ initiate(txn, context?), handleWebhook(request) }`. À l'import, appelle `registerProvider("stripe", stripeProvider)`.
  - `initiate(txn, context) -> { redirectUrl, providerRef, txnExtra: { fxRateArPerEur, amountEurCents } }`
  - `handleWebhook(request) -> { ok, transactionId?, completed?, error? }`

- [ ] **Step 1: Écrire les tests (ils doivent échouer)**

Créer `src/lib/stripeProvider.test.js` :

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { setRedisClient } from "./redis.js";
import { createFakeRedis } from "./testFakeRedis.js";
import { setStripeClient, stripeProvider } from "./stripeProvider.js";

test("initiate : convertit Ar→centimes EUR, crée une Checkout Session, renvoie txnExtra", async () => {
  const redis = createFakeRedis();
  await redis.set("fxRate:EUR:MGA", 4800); // 4800 Ar / EUR
  setRedisClient(redis);

  let captured = null;
  setStripeClient({
    checkout: {
      sessions: {
        async create(params) {
          captured = params;
          return { id: "cs_test_1", url: "https://checkout.stripe.com/x" };
        },
      },
    },
  });

  const res = await stripeProvider.initiate(
    { id: "txn_1", accountId: "acc_1", amountAr: 5000 },
    { origin: "https://app.example" },
  );

  assert.equal(res.redirectUrl, "https://checkout.stripe.com/x");
  assert.equal(res.providerRef, "cs_test_1");
  assert.equal(res.txnExtra.fxRateArPerEur, 4800);
  assert.equal(res.txnExtra.amountEurCents, 104); // round(5000/4800*100)

  assert.equal(captured.mode, "payment");
  assert.equal(captured.line_items[0].price_data.currency, "eur");
  assert.equal(captured.line_items[0].price_data.unit_amount, 104);
  assert.equal(captured.metadata.txnId, "txn_1");
  assert.equal(captured.metadata.accountId, "acc_1");
  assert.equal(captured.success_url, "https://app.example/host/wallet?checkout=success");
  assert.equal(captured.cancel_url, "https://app.example/host/wallet?checkout=cancel");
});

function fakeRequest() {
  return {
    async text() { return "corps-brut"; },
    headers: { get() { return "sig_test"; } },
  };
}

test("handleWebhook : événement complété signé → completed", async () => {
  setStripeClient({
    webhooks: {
      constructEvent() {
        return {
          type: "checkout.session.completed",
          data: { object: { metadata: { txnId: "txn_9" } } },
        };
      },
    },
  });
  const res = await stripeProvider.handleWebhook(fakeRequest());
  assert.deepEqual(res, { ok: true, transactionId: "txn_9", completed: true });
});

test("handleWebhook : signature invalide → ok:false, jamais de crédit", async () => {
  setStripeClient({
    webhooks: {
      constructEvent() { throw new Error("signature invalide"); },
    },
  });
  const res = await stripeProvider.handleWebhook(fakeRequest());
  assert.equal(res.ok, false);
});

test("handleWebhook : autre type d'événement → ok:true sans completed", async () => {
  setStripeClient({
    webhooks: {
      constructEvent() { return { type: "payment_intent.created", data: { object: {} } }; },
    },
  });
  const res = await stripeProvider.handleWebhook(fakeRequest());
  assert.equal(res.ok, true);
  assert.equal(res.completed, undefined);
});
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `node --test src/lib/stripeProvider.test.js`
Expected: FAIL — `Cannot find module './stripeProvider.js'`

- [ ] **Step 3: Implémenter `src/lib/stripeProvider.js`**

```js
import Stripe from "stripe";
import { registerProvider } from "./payments.js";
import { getArPerEurRate } from "./fxRate.js";

// Provider de paiement Stripe (Checkout Session + webhook signé), branché sur
// l'abstraction provider-agnostique de payments.js. Le solde est en Ariary ;
// Stripe facture en EUR au taux du jour (voir fxRate.js). Le crédit du solde
// n'a lieu qu'à la réception du webhook `checkout.session.completed` signé.

let stripeClient = null;

/** Injection d'un client (tests). */
export function setStripeClient(client) {
  stripeClient = client;
}

export function getStripeClient() {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY non configurée.");
  stripeClient = new Stripe(key);
  return stripeClient;
}

export const stripeProvider = {
  async initiate(txn, context = {}) {
    const rate = await getArPerEurRate();
    const amountEurCents = Math.round((txn.amountAr / rate) * 100);
    const origin = context.origin || process.env.APP_BASE_URL || "";
    const session = await getStripeClient().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: `Recharge valio.fanontaniana — ${txn.amountAr} Ar` },
            unit_amount: amountEurCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/host/wallet?checkout=success`,
      cancel_url: `${origin}/host/wallet?checkout=cancel`,
      metadata: { txnId: txn.id, accountId: txn.accountId },
    });
    return {
      redirectUrl: session.url,
      providerRef: session.id,
      txnExtra: { fxRateArPerEur: rate, amountEurCents },
    };
  },

  async handleWebhook(request) {
    // Corps BRUT obligatoire pour la vérification de signature (jamais .json()).
    const raw = await request.text();
    const signature = request.headers.get("stripe-signature");
    let event;
    try {
      event = getStripeClient().webhooks.constructEvent(
        raw,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch {
      return { ok: false, error: "Signature webhook invalide." };
    }
    if (event.type === "checkout.session.completed") {
      const txnId = event.data.object?.metadata?.txnId;
      if (!txnId) return { ok: false, error: "metadata.txnId manquant." };
      return { ok: true, transactionId: txnId, completed: true };
    }
    return { ok: true }; // autres événements ignorés sans erreur
  },
};

registerProvider("stripe", stripeProvider);
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `node --test src/lib/stripeProvider.test.js`
Expected: `4 pass`

- [ ] **Step 5: Suite complète verte**

Run: `npm test`
Expected: `93 pass` (89 + 4)

- [ ] **Step 6: Commit**

```bash
git add src/lib/stripeProvider.js src/lib/stripeProvider.test.js
git commit -m "feat: provider Stripe (Checkout Session + webhook signé)"
```

---

### Task 4: Extension `payments.js` — txnExtra, historique, listTransactions

**Files:**
- Modify: `src/lib/payments.js`
- Modify: `src/lib/payments.test.js`

**Interfaces:**
- Consumes: `getdel`/`lpush`/`lrange`/`ltrim`/`mget` du faux Redis (déjà présents), `getTransaction`/`registerProvider` (déjà exportés).
- Produces: `initiateTopup(accountId, amountAr, providerName?, context?)` — 4ᵉ paramètre `context` transmis à `provider.initiate(txn, context)`, et fusion de `started.txnExtra` dans la transaction avant sauvegarde ; push dans l'index `txnHistory:<accountId>`. Nouvelle fonction `listTransactions(accountId, limit=50) -> Promise<Transaction[]>` (plus récent en tête).

- [ ] **Step 1: Écrire les tests (doivent échouer)**

Ajouter à `src/lib/payments.test.js`, et étendre l'import de la ligne 6 :

```js
import {
  initiateTopup,
  completeTransaction,
  getTransaction,
  registerProvider,
  listTransactions,
} from "./payments.js";
```

Puis, à la fin du fichier :

```js
test("listTransactions : plus récent en tête, isolé par compte", async () => {
  setRedisClient(createFakeRedis());
  const a = (await createAccount({ email: "a@e.mg", password: "secret1" })).account;
  const b = (await createAccount({ email: "b@e.mg", password: "secret1" })).account;

  await initiateTopup(a.id, 5000, "stub");
  await initiateTopup(a.id, 20000, "stub");
  await initiateTopup(b.id, 1000, "stub");

  const listA = await listTransactions(a.id);
  assert.equal(listA.length, 2);
  assert.equal(listA[0].amountAr, 20000, "le plus récent est en tête");
  assert.equal(listA[1].amountAr, 5000);
  assert.ok(listA.every((t) => t.accountId === a.id), "isolé par compte");

  const listB = await listTransactions(b.id);
  assert.equal(listB.length, 1);
  assert.equal(listB[0].amountAr, 1000);
});

test("initiateTopup : fusionne txnExtra du provider dans la transaction", async () => {
  setRedisClient(createFakeRedis());
  const { account } = await createAccount({ email: "p@e.mg", password: "secret1" });

  registerProvider("faketest", {
    async initiate(txn, context) {
      return {
        providerRef: "ref_1",
        redirectUrl: "https://pay/x",
        txnExtra: { fxRateArPerEur: 4800, amountEurCents: 104, origin: context?.origin },
      };
    },
  });

  const res = await initiateTopup(account.id, 5000, "faketest", { origin: "https://app" });
  assert.equal(res.ok, true);
  assert.equal(res.redirectUrl, "https://pay/x");

  const txn = await getTransaction(res.transaction.id);
  assert.equal(txn.fxRateArPerEur, 4800);
  assert.equal(txn.amountEurCents, 104);
  assert.equal(txn.status, "pending", "pas d'autoComplete → reste en attente");
});
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `node --test src/lib/payments.test.js`
Expected: FAIL — `listTransactions is not a function` (et les nouvelles assertions échouent).

- [ ] **Step 3: Modifier `src/lib/payments.js`**

Ajouter, juste après `const txnKey = (id) => \`txn:${id}\`;` (ligne 16) :

```js
const TXN_HISTORY_MAX = 200; // même borne que l'historique d'examens
const txnHistoryKey = (accountId) => `txnHistory:${accountId}`;
```

Remplacer le corps de `initiateTopup` (à partir de la création de `started`) — c'est-à-dire remplacer :

```js
  const started = (await provider.initiate(txn)) || {};
  txn.providerRef = started.providerRef || null;
  await saveTxn(txn);

  // Provider synchrone (ex. stub) : on complète tout de suite.
  if (started.autoComplete) return completeTransaction(txn.id);

  return {
    ok: true,
    transaction: txn,
    redirectUrl: started.redirectUrl || null,
    instructions: started.instructions || null,
  };
```

par :

```js
  const started = (await provider.initiate(txn, context)) || {};
  txn.providerRef = started.providerRef || null;
  // Champs additionnels du provider (ex. taux de change appliqué) — traçabilité.
  if (started.txnExtra) Object.assign(txn, started.txnExtra);
  await saveTxn(txn);
  // Index d'historique des recharges du compte (plus récent en tête).
  const redis = getRedis();
  await redis.lpush(txnHistoryKey(accountId), txn.id);
  await redis.ltrim(txnHistoryKey(accountId), 0, TXN_HISTORY_MAX - 1);

  // Provider synchrone (ex. stub) : on complète tout de suite.
  if (started.autoComplete) return completeTransaction(txn.id);

  return {
    ok: true,
    transaction: txn,
    redirectUrl: started.redirectUrl || null,
    instructions: started.instructions || null,
  };
```

Et modifier la signature de `initiateTopup` (ligne ~51) pour accepter `context` :

```js
export async function initiateTopup(accountId, amountAr, providerName = "stub", context = {}) {
```

Ajouter, à la fin du fichier :

```js
/** Historique des recharges d'un compte (transactions), plus récent en tête. */
export async function listTransactions(accountId, limit = 50) {
  const redis = getRedis();
  const ids = await redis.lrange(txnHistoryKey(accountId), 0, limit - 1);
  if (!ids || ids.length === 0) return [];
  const txns = await redis.mget(...ids.map(txnKey));
  return txns.filter(Boolean);
}
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `node --test src/lib/payments.test.js`
Expected: PASS (tous les tests du fichier, dont les 2 nouveaux et les 3 existants).

- [ ] **Step 5: Suite complète verte**

Run: `npm test`
Expected: `95 pass` (93 + 2)

- [ ] **Step 6: Commit**

```bash
git add src/lib/payments.js src/lib/payments.test.js
git commit -m "feat: historique des recharges + fusion txnExtra (payments.js)"
```

---

### Task 5: Routes API — topup, history, webhook

**Files:**
- Modify: `src/app/api/wallet/topup/route.js`
- Create: `src/app/api/wallet/history/route.js`
- Modify: `src/app/api/wallet/webhook/[provider]/route.js`

**Interfaces:**
- Consumes: `initiateTopup`/`listTransactions` (`src/lib/payments.js`, Task 4), le provider `stripe` auto-enregistré par `src/lib/stripeProvider.js` (Task 3, via import à effet de bord), `accountFromRequest` (`src/lib/authServer.js`), `readBody`/`json`/`handler` (`src/lib/http.js`).

Pas de test automatisé dédié (routes fines sur des fonctions déjà testées ; convention projet : seules les fonctions de `src/lib/*.js` sont testées unitairement). Vérification par build + Task 9.

- [ ] **Step 1: Remplacer `src/app/api/wallet/topup/route.js`**

```js
import { initiateTopup } from "@/lib/payments";
import "@/lib/stripeProvider"; // enregistre le provider "stripe"
import { accountFromRequest } from "@/lib/authServer";
import { readBody, json, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

const MIN_AR = 500;
const MAX_AR = 1000000;

// Démarre une recharge Stripe : crée une Checkout Session et renvoie l'URL de
// redirection. Le crédit du solde a lieu à la réception du webhook signé.
export const POST = handler(async (request) => {
  const account = await accountFromRequest(request);
  if (!account) return json({ error: "Connexion requise." }, 401);

  const { amountAr } = await readBody(request);
  const amount = Math.round(Number(amountAr) || 0);
  if (amount < MIN_AR || amount > MAX_AR)
    return json({ error: `Montant invalide (entre ${MIN_AR} et ${MAX_AR} Ar).` }, 400);

  const origin = new URL(request.url).origin;
  const res = await initiateTopup(account.id, amount, "stripe", { origin });
  if (!res.ok) return json({ error: res.error }, res.status || 400);
  return json({ redirectUrl: res.redirectUrl, transactionId: res.transaction?.id });
});
```

- [ ] **Step 2: Créer `src/app/api/wallet/history/route.js`**

```js
import { listTransactions } from "@/lib/payments";
import { accountFromRequest } from "@/lib/authServer";
import { json, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

// Historique des recharges du compte connecté (plus récent en tête).
export const GET = handler(async (request) => {
  const account = await accountFromRequest(request);
  if (!account) return json({ error: "Connexion requise." }, 401);
  const transactions = await listTransactions(account.id);
  return json({ transactions });
});
```

- [ ] **Step 3: Ajouter l'import à effet de bord dans le webhook**

Dans `src/app/api/wallet/webhook/[provider]/route.js`, ajouter après la première ligne d'import :

```js
import { getProvider, completeTransaction, failTransaction } from "@/lib/payments";
import "@/lib/stripeProvider"; // enregistre le provider "stripe"
import { json, handler } from "@/lib/http";
```

(Le reste du fichier est inchangé : il passe déjà `request` entier à `impl.handleWebhook`, compatible avec la lecture du corps brut par le provider Stripe.)

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build réussit ; les routes `ƒ /api/wallet/topup`, `ƒ /api/wallet/history`, `ƒ /api/wallet/webhook/[provider]` apparaissent dans la sortie.

- [ ] **Step 5: Suite complète verte**

Run: `npm test`
Expected: `95 pass`

- [ ] **Step 6: Commit**

```bash
git add src/app/api/wallet/topup/route.js src/app/api/wallet/history/route.js src/app/api/wallet/webhook/[provider]/route.js
git commit -m "feat: routes API topup (Stripe) + history du portefeuille"
```

---

### Task 6: Icône wallet + entrée de navigation

**Files:**
- Modify: `src/components/Icon.jsx`
- Modify: `src/components/HostShell.jsx`

**Interfaces:**
- Produces: l'icône `wallet` disponible dans `<Icon name="wallet" />` ; l'entrée nav `/host/wallet` dans le shell formateur.

- [ ] **Step 1: Ajouter l'icône `wallet` dans `src/components/Icon.jsx`**

Dans l'objet `PATHS`, ajouter (juste après l'entrée `logout`, avant l'accolade fermante de `PATHS`) :

```js
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14" r="1" />
    </>
  ),
```

- [ ] **Step 2: Ajouter l'entrée de nav dans `src/components/HostShell.jsx`**

Remplacer le tableau `NAV` (lignes 10-15) par :

```js
const NAV = [
  { href: "/host", label: "Créer un quiz", icon: "plus", exact: true },
  { href: "/host/dashboard", label: "Tableau de bord", icon: "chart" },
  { href: "/host/classes", label: "Mes classes", icon: "users" },
  { href: "/host/history", label: "Mes examens", icon: "clock" },
  { href: "/host/wallet", label: "Portefeuille", icon: "wallet" },
];
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build réussit sans erreur.

- [ ] **Step 4: Suite complète verte**

Run: `npm test`
Expected: `95 pass`

- [ ] **Step 5: Commit**

```bash
git add src/components/Icon.jsx src/components/HostShell.jsx
git commit -m "feat(ui): entrée de navigation Portefeuille + icône wallet"
```

---

### Task 7: Page `/host/wallet`

**Files:**
- Create: `src/app/host/wallet/page.jsx`

**Interfaces:**
- Consumes: `useAccount()` (`src/lib/account-client.js`), `apiGet`/`apiPost` (`src/lib/api.js`), `POST /api/wallet/topup` + `GET /api/wallet/history` (Task 5).

- [ ] **Step 1: Créer `src/app/host/wallet/page.jsx`**

```jsx
"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiGet, apiPost } from "@/lib/api";
import { useAccount } from "@/lib/account-client";

const PRESETS = [5000, 20000, 50000];
const MIN_AR = 500;

const STATUS_LABEL = {
  completed: "Confirmée",
  pending: "En attente",
  failed: "Échouée",
};

function frDate(ts) {
  return ts
    ? new Date(ts).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })
    : "";
}

function WalletInner() {
  const params = useSearchParams();
  const checkout = params.get("checkout"); // "success" | "cancel" | null
  const { account, loading, refresh } = useAccount();
  const [amount, setAmount] = useState(5000);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState(null);
  const [pendingConfirm, setPendingConfirm] = useState(false);

  async function loadHistory() {
    const { ok, data } = await apiGet("/api/wallet/history");
    if (ok) setHistory(data.transactions || []);
  }

  useEffect(() => {
    if (account) loadHistory();
  }, [account]);

  // Retour de Stripe : le webhook peut arriver après la redirection navigateur.
  // On rafraîchit tout de suite puis une seconde fois après ~2 s ; si le solde
  // n'a pas bougé entre-temps, on affiche « confirmation en cours ».
  useEffect(() => {
    if (checkout !== "success") return;
    let cancelled = false;
    (async () => {
      const before = await refresh();
      await loadHistory();
      await new Promise((r) => setTimeout(r, 2000));
      if (cancelled) return;
      const after = await refresh();
      await loadHistory();
      if (!cancelled && before && after && after.balanceAr === before.balanceAr) {
        setPendingConfirm(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checkout, refresh]);

  const selected = custom ? Math.round(Number(custom) || 0) : amount;

  async function recharge() {
    setError("");
    if (selected < MIN_AR) {
      setError(`Montant minimum : ${MIN_AR} Ar.`);
      return;
    }
    setBusy(true);
    const { ok, data } = await apiPost("/api/wallet/topup", { amountAr: selected });
    setBusy(false);
    if (!ok || !data?.redirectUrl) {
      setError(data?.error || "Recharge impossible pour le moment.");
      return;
    }
    window.location.href = data.redirectUrl;
  }

  if (loading) {
    return <div className="center-work"><div className="spin" role="status" aria-label="Chargement" /></div>;
  }

  if (!account) {
    return (
      <div className="center-work">
        <div className="card stack gap-16" style={{ textAlign: "center", maxWidth: 440 }}>
          <h2>Portefeuille</h2>
          <p className="muted">Connectez-vous pour gérer votre solde.</p>
          <Link href="/host" className="btn btn--primary">Créer un quiz</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="stack gap-24">
      <div className="stack gap-8">
        <span className="eyebrow">Votre portefeuille</span>
        <h1 style={{ fontSize: "2rem" }}>
          Solde : <span className="money">{account.balanceAr} Ar</span>
        </h1>
      </div>

      {checkout === "success" && (
        <div className="card card--ok stack gap-8" role="status">
          <strong>Paiement reçu</strong>
          <span className="muted tiny">
            {pendingConfirm
              ? "Confirmation en cours — votre solde sera crédité dans un instant. Actualisez la page si besoin."
              : "Votre solde a été mis à jour."}
          </span>
        </div>
      )}
      {checkout === "cancel" && (
        <div className="panel" role="status">
          <span className="muted">Paiement annulé — aucun montant n'a été débité.</span>
        </div>
      )}

      <div className="card stack gap-16">
        <span className="eyebrow">Recharger</span>
        <div className="row gap-8 wrap">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className={`btn ${!custom && amount === p ? "btn--primary" : "btn--ghost"}`}
              onClick={() => {
                setAmount(p);
                setCustom("");
              }}
            >
              {p.toLocaleString("fr-FR")} Ar
            </button>
          ))}
        </div>
        <div>
          <label className="label" htmlFor="wallet-custom">Autre montant (Ar)</label>
          <input
            id="wallet-custom"
            className="input"
            type="number"
            min={MIN_AR}
            inputMode="numeric"
            placeholder="ex. 10 000"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        <button
          type="button"
          className="btn btn--primary btn--lg btn--block"
          onClick={recharge}
          disabled={busy || selected < MIN_AR}
        >
          {busy
            ? "Redirection…"
            : `Recharger ${selected >= MIN_AR ? selected.toLocaleString("fr-FR") + " Ar" : ""}`}
        </button>
        <p className="tiny muted" style={{ textAlign: "center" }}>
          Paiement sécurisé par carte via Stripe (facturé en euros au taux du jour).
        </p>
      </div>

      <div className="stack gap-12">
        <span className="eyebrow">Historique des recharges</span>
        {history === null ? (
          <div className="spin" role="status" aria-label="Chargement" style={{ margin: "0 auto" }} />
        ) : history.length === 0 ? (
          <div className="panel" style={{ textAlign: "center" }}>
            <p className="muted">Aucune recharge pour l'instant.</p>
          </div>
        ) : (
          <div className="stack gap-8">
            {history.map((t) => (
              <div key={t.id} className="grade-row">
                <div className="grade-row__ans">
                  <div className="money" style={{ fontWeight: 700 }}>{t.amountAr} Ar</div>
                  <div className="muted tiny">{frDate(t.createdAt)}</div>
                </div>
                <span className="pill">{STATUS_LABEL[t.status] || t.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function HostWalletPage() {
  return (
    <Suspense
      fallback={<div className="center-work"><div className="spin" role="status" aria-label="Chargement" /></div>}
    >
      <WalletInner />
    </Suspense>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build réussit ; `○ /host/wallet` (ou `ƒ`) apparaît dans la sortie.

- [ ] **Step 3: Vérification visuelle (headless, état non connecté = 200)**

Run:
```bash
npm run dev > /tmp/dev-wallet.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/host/wallet
pkill -f "next dev" || true
```
Expected: `200`

- [ ] **Step 4: Commit**

```bash
git add src/app/host/wallet/page.jsx
git commit -m "feat(ui): page /host/wallet (recharge Stripe + historique)"
```

---

### Task 8: Simplifier `RechargeModal` → lien vers `/host/wallet`

**Files:**
- Modify: `src/components/RechargeModal.jsx`
- Modify: `src/app/host/lobby/page.jsx`

**Interfaces:**
- Consumes: la page `/host/wallet` (Task 7).
- Produces: `RechargeModal` ne fait plus de recharge en propre (plus de prop `onRecharged`, plus d'appel `apiPost`) — un lien renvoie vers la page portefeuille.

- [ ] **Step 1: Remplacer `src/components/RechargeModal.jsx`**

```jsx
"use client";
import Link from "next/link";
import Modal from "@/components/Modal";

// Popup affiché quand le solde ne couvre pas le lancement de l'examen.
// La recharge réelle se fait sur la page portefeuille (un seul point d'entrée).
export default function RechargeModal({ priceAr, balanceAr, busyRetry, onRetry, onClose }) {
  const enough = (Number(balanceAr) || 0) >= priceAr;

  return (
    <Modal onClose={onClose} labelledBy="recharge-title">
      <div className="stack gap-8" style={{ textAlign: "center" }}>
        <h2 id="recharge-title" style={{ fontSize: "1.4rem" }}>Solde insuffisant</h2>
        <p className="muted">
          Lancer cet examen coûte <strong className="money">{priceAr} Ar</strong>.
          Votre solde est de <strong className="money">{balanceAr} Ar</strong>.
        </p>
      </div>

      <Link href="/host/wallet" className="btn btn--ghost btn--block">
        Recharger mon compte
      </Link>

      <button
        type="button"
        className="btn btn--primary btn--lg btn--block"
        onClick={onRetry}
        disabled={!enough || busyRetry}
      >
        {busyRetry ? "Lancement…" : "Réessayer le lancement"}
      </button>
      <button type="button" className="btn btn--ghost btn--block" onClick={onClose}>
        Annuler
      </button>
    </Modal>
  );
}
```

- [ ] **Step 2: Retirer la prop `onRecharged` désormais inutile dans le lobby**

Dans `src/app/host/lobby/page.jsx`, remplacer l'invocation de `RechargeModal` :

```jsx
        <RechargeModal
          priceAr={recharge.priceAr}
          balanceAr={recharge.balanceAr}
          busyRetry={busy}
          onRecharged={(bal) => setRecharge((r) => ({ ...r, balanceAr: bal }))}
          onRetry={() => {
            setRecharge(null);
            launch();
          }}
          onClose={() => setRecharge(null)}
        />
```

par :

```jsx
        <RechargeModal
          priceAr={recharge.priceAr}
          balanceAr={recharge.balanceAr}
          busyRetry={busy}
          onRetry={() => {
            setRecharge(null);
            launch();
          }}
          onClose={() => setRecharge(null)}
        />
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build réussit sans erreur.

- [ ] **Step 4: Suite complète verte**

Run: `npm test`
Expected: `95 pass`

- [ ] **Step 5: Commit**

```bash
git add src/components/RechargeModal.jsx src/app/host/lobby/page.jsx
git commit -m "feat(ui): RechargeModal renvoie vers la page portefeuille"
```

---

### Task 9: Vérification finale

**Files:** Aucun (vérification uniquement).

- [ ] **Step 1: Suite de tests complète**

Run: `npm test`
Expected: `95 pass`, `0 fail`.

- [ ] **Step 2: Build complet**

Run: `npm run build`
Expected: build réussit ; présence dans la sortie de `ƒ /api/wallet/topup`, `ƒ /api/wallet/history`, `ƒ /api/wallet/webhook/[provider]`, et de la page portefeuille `/host/wallet`.

- [ ] **Step 3: Smoke de la navigation (headless)**

Run:
```bash
npm run dev > /tmp/dev-final.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "host: %{http_code}\n" http://localhost:3000/host
curl -s -o /dev/null -w "wallet: %{http_code}\n" http://localhost:3000/host/wallet
pkill -f "next dev" || true
```
Expected: `host: 200` et `wallet: 200`.

- [ ] **Step 4: Récapitulatif à l'utilisateur**

Confirmer : nombre de tests (95), build vert, et rappeler les prérequis opérateur avant la première recharge réelle :
1. Créer un compte Stripe et définir sur Vercel (Production + Preview) : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_EUR_TO_AR_FALLBACK_RATE`, et si besoin `APP_BASE_URL`.
2. Créer dans le Dashboard Stripe un endpoint Webhook pointant vers `https://VOTRE-DOMAINE/api/wallet/webhook/stripe`, écoutant l'événement `checkout.session.completed`, et reporter son secret de signature dans `STRIPE_WEBHOOK_SECRET`.
3. Sans ces variables, la page `/host/wallet` s'affiche mais toute tentative de recharge échoue proprement (message d'erreur, pas de crash).

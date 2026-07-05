# Portefeuille formateur : paiement Stripe + nouvelle page de recharge — Design

## Contexte

Le porte-monnaie formateur (`balanceAr`, en Ariary) n'a aujourd'hui qu'un
provider de paiement **stub** (`src/lib/payments.js`) : la recharge crédite
immédiatement le compte sans paiement réel, déclenchée uniquement de façon
réactive par `RechargeModal.jsx` quand le solde ne couvre pas le lancement
d'un Examen. Il n'existe aucune page dédiée au portefeuille, et aucun moyen
de recharger proactivement en dehors de ce flux réactif.

Objectif : intégrer un vrai paiement **Stripe**, et ajouter une entrée de
navigation formateur qui ouvre une interface de gestion du portefeuille
permettant de recharger à tout moment.

Décisions validées pendant le brainstorming :
- **Aucun compte Stripe n'existe encore** — sa création est une étape
  opérateur séparée (comme pour n8n), les clés arrivent en variables
  d'environnement.
- Stripe facture en **EUR** (Ariary non supporté nativement par Stripe ;
  Madagascar n'est pas un pays d'immatriculation marchand supporté).
- Paliers de recharge : **montants fixes (5 000 / 20 000 / 50 000 Ar) +
  montant libre**.
- Taux de change EUR→Ariary **en direct** (API externe), avec repli en
  cascade pour ne jamais faire dépendre un paiement de la disponibilité de
  cette API.
- Mécanique de paiement : **Stripe Checkout Session** (page hébergée +
  webhook de confirmation), pas de formulaire carte intégré (Elements) —
  moins de code, aucune donnée carte ne transite par notre serveur, cohérent
  avec le pattern déjà utilisé pour la redirection Google OAuth.
- Nouvelle page **`/host/wallet`** (pas une simple modale) avec historique
  des recharges, remplaçant à terme le flux de test de `RechargeModal`.

## Architecture

### 1. Provider Stripe (`src/lib/stripeProvider.js`, nouveau)

Respecte l'abstraction `{ initiate(txn), handleWebhook(request) }` déjà
définie dans `payments.js` (voir `registerProvider`/`getProvider`).

```js
async function initiate(txn) {
  const rate = await getArPerEurRate(); // Ariary pour 1 EUR
  const amountEurCents = Math.round((txn.amountAr / rate) * 100);
  const session = await getStripeClient().checkout.sessions.create({
    mode: "payment",
    line_items: [{
      price_data: {
        currency: "eur",
        product_data: { name: `Recharge valio.fanontaniana — ${txn.amountAr} Ar` },
        unit_amount: amountEurCents,
      },
      quantity: 1,
    }],
    success_url: `${originFor(txn)}/host/wallet?checkout=success`,
    cancel_url: `${originFor(txn)}/host/wallet?checkout=cancel`,
    metadata: { txnId: txn.id, accountId: txn.accountId },
  });
  return {
    redirectUrl: session.url,
    providerRef: session.id,
    txnExtra: { fxRateArPerEur: rate, amountEurCents },
  };
}

async function handleWebhook(request) {
  const raw = await request.text(); // brut, jamais request.json() (signature)
  const signature = request.headers.get("stripe-signature");
  let event;
  try {
    event = getStripeClient().webhooks.constructEvent(
      raw, signature, process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return { ok: false, error: "Signature webhook invalide." };
  }
  if (event.type === "checkout.session.completed") {
    const txnId = event.data.object.metadata?.txnId;
    if (!txnId) return { ok: false, error: "metadata.txnId manquant." };
    return { ok: true, transactionId: txnId, completed: true };
  }
  return { ok: true }; // autres événements ignorés sans erreur
}
```

`getStripeClient()` instancie paresseusement le SDK Stripe officiel
(`new Stripe(process.env.STRIPE_SECRET_KEY)`), avec un point d'injection
`setStripeClient()` pour les tests (même pattern que `setRedisClient` dans
`redis.js`).

**Extension minimale de `initiateTopup`** (`payments.js`) : les champs
optionnels que `initiate()` retourne dans `txnExtra` sont fusionnés dans la
transaction avant sauvegarde (`Object.assign(txn, started.txnExtra || {})`),
pour tracer le taux de change réellement appliqué — rétrocompatible, le
provider `stub` n'en renvoie simplement pas.

### 2. Taux de change (`src/lib/fxRate.js`, nouveau)

```js
export async function getArPerEurRate() {
  const cached = await redis.get("fxRate:EUR:MGA");
  if (cached) return cached;

  try {
    const rate = await fetchLiveRate(); // open.er-api.com/v6/latest/EUR, timeout ~3s
    await redis.set("fxRate:EUR:MGA", rate, { ex: 6 * 3600 });
    await redis.set("fxRate:EUR:MGA:last", rate); // durable, jamais de TTL
    return rate;
  } catch {
    const last = await redis.get("fxRate:EUR:MGA:last");
    if (last) return last;
    return Number(process.env.STRIPE_EUR_TO_AR_FALLBACK_RATE) || 4800;
  }
}
```

Repli en cascade : cache frais (TTL 6h) → dernier taux connu (durable,
mis à jour uniquement sur fetch réussi) → constante de secours (env,
défaut 4800 si absente). Un paiement ne doit jamais échouer parce que
l'API de taux de change est indisponible. Le fetch réutilise le pattern
`AbortController`/timeout déjà en place dans `src/lib/notify.js`.

### 3. Modèle de données (Redis)

- `txnHistory:<accountId>` — Redis LIST des ids de transaction (poussée à
  chaque `initiateTopup`), plafonnée par `LTRIM` (même borne que
  `examHistory:<accountId>` dans `history.js`). Nouvelle fonction
  `listTransactions(accountId, limit=50)` dans `payments.js` (`LRANGE` +
  `MGET`, même pattern que `listExamRecords`).
- `fxRate:EUR:MGA` (TTL 6h) et `fxRate:EUR:MGA:last` (durable) — décrits
  ci-dessus.
- `txn:<id>` (existant, inchangé) gagne deux champs optionnels
  (`fxRateArPerEur`, `amountEurCents`), remplis uniquement par le provider
  Stripe.

### 4. UI

**`HostShell.jsx`** : nouvelle entrée de nav
`{ href: "/host/wallet", label: "Portefeuille", icon: "wallet" }`, avant ou
après « Mes examens » selon l'ordre logique (accès compte). Nécessite une
nouvelle icône `wallet` dans `Icon.jsx` (SVG inline, style Lucide/trait 2px,
cohérent avec les icônes existantes).

**Nouvelle page `src/app/host/wallet/page.jsx`** (dans le shell formateur,
comme `/host/dashboard`) :
- Solde actuel (via `useAccount()`).
- Paliers rapides (boutons 5 000 / 20 000 / 50 000 Ar) + champ « autre
  montant ».
- Bouton « Recharger » → `POST /api/wallet/topup { amountAr }` →
  `window.location.href = redirectUrl` (redirection Stripe, même pattern
  que le bouton Google OAuth existant).
- Gestion du retour Stripe via `?checkout=success|cancel` en query string :
  sur `success`, rafraîchit le compte (`useAccount().refresh()`)
  immédiatement puis une seconde fois après ~2s (le webhook peut arriver
  après la redirection navigateur) ; si le solde n'a toujours pas bougé,
  affiche un message « Confirmation en cours, actualisez dans un instant »
  plutôt que de boucler indéfiniment. Sur `cancel`, message neutre
  (« Paiement annulé »).
- Liste l'historique des recharges (date, montant Ar, statut) sous le
  formulaire, via `GET /api/wallet/history`.

**`RechargeModal.jsx`** (modifié) : le bouton « Recharger +5 000 Ar (test) »
qui appelait `POST /api/wallet/topup` en silence devient un lien
« Recharger mon compte » vers `/host/wallet` — un seul point d'entrée réel
pour la recharge (la page portefeuille), pas de logique Stripe dupliquée
dans la modale. Le reste de la modale (comparaison prix/solde, bouton
« Réessayer le lancement ») est inchangé.

### 5. Endpoints API

- `POST /api/wallet/topup` (modifié) : body `{ amountAr }` (remplace le
  montant fixe `TOPUP_TEST_AR` codé en dur) ; validation bornée (500 –
  1 000 000 Ar, sinon `400`) ; appelle
  `initiateTopup(account.id, amountAr, "stripe")` ; répond
  `{ redirectUrl, transactionId }`.
- `GET /api/wallet/history` (nouveau) : auth requise (401 sinon), retourne
  `{ transactions: listTransactions(account.id) }`.
- `POST /api/wallet/webhook/stripe` (point de montage générique déjà en
  place) : dispatch vers `stripeProvider.handleWebhook`, sans changement à
  la route elle-même.
- Le provider `stub` reste enregistré (utile aux tests existants et à
  `payments.test.js`), simplement plus jamais sélectionné par la route
  topup en usage normal.

### 6. Sécurité

- **Signature webhook** vérifiée via `stripe.webhooks.constructEvent` sur
  le corps **brut** de la requête — jamais de crédit sans signature valide.
- **Idempotence** déjà garantie par `completeTransaction` existant
  (`status === TXN_COMPLETED` → no-op, donc un replay/double webhook Stripe
  ne crédite jamais deux fois).
- **Montants bornés** côté route (`500` – `1 000 000` Ar) pour éviter un
  montant absurde, négatif ou nul.
- Les clés API (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) et le taux de
  secours (`STRIPE_EUR_TO_AR_FALLBACK_RATE`) sont des variables
  d'environnement, jamais en dur dans le code.

### 7. Tests

- `fxRate.test.js` (nouveau) : cache hit (Redis), repli sur le dernier taux
  connu si le fetch échoue, repli final sur la constante si tout échoue —
  `fetch` mocké comme dans `notify.test.js`.
- `stripeProvider.test.js` (nouveau) : création de session via un client
  Stripe injecté (`setStripeClient()`), vérification de signature webhook
  (accepte un événement valide, rejette une signature invalide), mapping
  `checkout.session.completed` → `{completed:true}`.
- `payments.test.js` (étendu) : `listTransactions` (ordre chronologique,
  plafond, isolation par compte), fusion de `txnExtra` dans la transaction
  sauvegardée.
- `npm test` et `npm run build` doivent rester verts.

### 8. Nouvelle dépendance

`stripe` (SDK Node officiel) — seule nouvelle dépendance npm de ce projet
à ce jour en dehors de `@upstash/redis`/`jspdf`/`jspdf-autotable`.

## Hors scope (pour rester simple)

- Pas de gestion des remboursements (refunds) dans cette itération.
- Pas de facture/reçu PDF généré pour les recharges (l'historique suffit).
- Pas de moyens de paiement mobile money malgaches (Mvola/Orange/Airtel) —
  l'abstraction provider-agnostique de `payments.js` le permettra plus tard
  sans changement de la couche solde/examen.
- Pas de limite de recharge par période (anti-fraude) — à envisager si le
  volume le justifie.

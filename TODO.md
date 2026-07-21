# TODO — valio.fanontaniana

Récapitulatif de tout ce qui reste à faire sur le projet : actions manuelles
opérateur (bloquantes pour activer certaines fonctionnalités en prod), dette
technique relevée pendant les revues de code, et feuille de route non encore
planifiée. Aucun `TODO`/`FIXME` n'existe dans le code source lui-même — ce
fichier centralise ce qui vit jusqu'ici dans les specs/plans et l'historique
des revues.

---

## 🔴 Actions manuelles requises (bloquantes en production)

### Emails transactionnels (n8n)

- [ ] Définir sur Vercel (Production + Preview) : `N8N_WEBHOOK_URL`,
      `N8N_WEBHOOK_SECRET`.
- [ ] Ouvrir le workflow n8n « Emails transactionnels valio.fanontaniana »
      (id `Si6m7cAWazQbdQPu`) et **vérifier manuellement** que le credential
      Gmail « Maikagency GMAIL ACCOUNT » est bien sélectionné sur les 3 nœuds
      Gmail (`Send Account Created / Google Welcome / Password Reset Email`)
      — l'API n8n ne permet pas de le confirmer par programme.
      Voir `docs/superpowers/plans/2026-07-04-emails-n8n-reset-password.md` (Task 11).

### Paiement Stripe

- [ ] Créer un compte Stripe (Madagascar n'étant pas un pays d'immatriculation
      marchand supporté par Stripe — utiliser une entité dans un pays
      supporté).
- [ ] Définir sur Vercel (Production + Preview) : `STRIPE_SECRET_KEY`,
      `STRIPE_WEBHOOK_SECRET`, `STRIPE_EUR_TO_AR_FALLBACK_RATE`,
      `APP_BASE_URL`.
- [ ] Créer dans le Dashboard Stripe un endpoint webhook pointant vers
      `https://VOTRE-DOMAINE/api/wallet/webhook/stripe`, écoutant l'événement
      `checkout.session.completed`.
      Voir `docs/superpowers/specs/2026-07-05-stripe-wallet-topup-design.md`.

---

## 🟡 Dette technique connue (relevée en revue, non bloquante)

Toute cette section a été traitée. Détail des résolutions ci-dessous ; le
seul point non automatisé (sticky notes n8n) est documenté avec sa raison.

### Sécurité / robustesse — ✅ résolu

- [x] **Canal de timing sur `POST /api/auth/password-reset/request`** :
      délai plancher constant (300ms) ajouté autour de tout le traitement,
      indépendant du fait que le compte existe ou non.
- [x] **Limitation de débit (`rate limiting`)** : implémentée en maison
      (`src/lib/rateLimit.js`, `INCR` + `EXPIRE` sur Upstash — pas de
      nouvelle dépendance) sur `login`, `signup`, `/api/verify/[code]` et
      `/api/auth/password-reset/request`. `join/register/answer` restent
      volontairement exclus : ce sont des IP d'établissements scolaires
      partagées, un plafond global les bloquerait collectivement.
- [x] `src/lib/payments.js` : `txnExtra` fusionné via une liste blanche de
      clés (`fxRateArPerEur`, `amountEurCents`) au lieu d'un
      `Object.assign` sans contrôle.

### Tests / couverture — ✅ résolu

- [x] `src/lib/accounts.js` : branche 404 de `setPassword` testée.
- [x] `src/lib/accounts.js` : `revokeOtherSessions` sur compte sans session
      active testé.
- [x] `src/lib/fxRate.js` : TTL de cache (6h) vérifié de bout en bout (le
      faux Redis de test simule désormais une vraie expiration) ; le cas
      `0` en cache est traité comme présent (`!= null` plutôt que test de
      vérité).
- [x] `src/lib/stripeProvider.js` : test ajouté pour `metadata.txnId`
      manquant sur un webhook signé, et pour le throw de `getStripeClient()`
      sans `STRIPE_SECRET_KEY`.

### UI — ✅ résolu

- [x] `src/lib/api.js` : `fetch` est maintenant protégé par un `try/catch`
      central (toutes les pages appelant `apiGet`/`apiPost`/... en
      bénéficient, pas seulement `reset-password`) — une coupure réseau ne
      laisse plus un bouton bloqué en « busy » sans message d'erreur.
- [x] `src/app/reset-password/page.jsx` : attribut natif `minLength={6}`
      ajouté aux deux champs mot de passe.
- [x] `src/app/reset-password/page.jsx` : redirection post-succès via
      `window.location.replace()` au lieu de `.href`.
- [ ] **Le workflow n8n a ses 5 sticky notes toutes empilées aux mêmes
      coordonnées dans le canvas** — laissé tel quel volontairement.
      `update_workflow` exige de repousser le code SDK complet du workflow
      (pas de patch incrémental), ce qui implique de retranscrire à la main
      3 corps d'email HTML de plusieurs Ko avec un mélange dense de guillemets
      simples (apostrophes françaises) et doubles (attributs HTML), sur un
      workflow **live et actif en production** qui envoie de vrais emails
      (dont les liens de reset de mot de passe). Le risque de corrompre un
      template email réel est disproportionné par rapport au bénéfice, purement
      cosmétique et visible seulement dans l'éditeur n8n. Correctif recommandé :
      ouvrir le workflow dans l'éditeur n8n et glisser chacune des 5 sticky
      notes à côté de la section qu'elle documente (30 secondes, zéro risque).

---

## 🟢 Feuille de route de scalabilité (50k+ utilisateurs / 2M+ examens)

Issue de l'audit de scalabilité complet (Phase 0 — bugs de concurrence —
déjà livrée : verrou Redis sur la clôture d'examen et sur credit/debit).
Rien ci-dessous n'est planifié pour une implémentation immédiate ; à
séquencer selon la croissance réelle.

### Phase 1 — Réduire le coût du polling (le plus gros levier)

- [ ] Mettre `usePolling` en pause via la Page Visibility API quand l'onglet
      est caché.
- [ ] Backoff adaptatif en lobby (1.2s → 3-5s si rien ne change, retour à
      1.2s dès qu'un changement est détecté).
- [ ] Fusionner les endpoints pollés en parallèle côté
      `host/results/page.jsx` (`state` + `results` + `review`).
- [ ] Endpoint de correction en masse des réponses libres
      (`POST /api/host/[code]/grade-bulk`).
- [ ] Observabilité : Sentry (ou équivalent) + logs structurés ; suivre le
      volume de commandes Upstash et le coût du polling via Vercel Analytics.

### Phase 2 — Faire évoluer le modèle de données Redis (rester Redis-only)

- [x] **Index globaux datés** (`src/lib/indexes.js`) : `accounts:all`,
      `exams:all`, `txns:all`, `plays:all`, `accounts:lastSeen` — Sorted Sets
      scorés par timestamp. Rien n'était énumérable globalement auparavant
      (toutes les clés étaient scopées par compte), ce qui rendait tout
      pilotage impossible. `plays:all` trace en outre les parties en mode
      **Libre** et les hôtes non connectés, jusqu'ici invisibles.
- [x] **TTL de 30 j retiré des transactions** (`payments.js`) : il détruisait
      silencieusement l'historique de recette au-delà d'un mois. Ce qui a
      expiré avant le correctif est perdu.
- [x] **Script de rattrapage** (`scripts/backfill-indexes.mjs`, logique dans
      `src/lib/backfill.js`) : reconstruit les index depuis l'existant via
      `SCAN`. Simulation par défaut, `--write` pour appliquer, idempotent.
      Rétroactif pour les comptes (`createdAt`) et les examens (`endedAt`) ;
      impossible pour les paiements déjà détruits par l'ancien TTL.
      **À exécuter une fois en production** — sans quoi les index ne
      contiennent que l'activité postérieure à leur mise en service.
- [ ] Remplacer les listes `examHistory:{accountId}` / `classExams:{classId}`
      (plafonnées à 200, entrées au-delà silencieusement inaccessibles) par
      des Sorted Sets (`ZADD`, score = timestamp) pour une vraie pagination
      par curseur.
- [ ] Précalculer les agrégats du tableau de bord (`src/lib/analytics.js`)
      au lieu de recalculer sur jusqu'à 200 enregistrements à chaque
      chargement.
- [ ] Plafonner `classList:{accountId}` (aujourd'hui non borné dans
      `src/lib/classrooms.js`), même pattern LTRIM que l'historique.
- [ ] Surveiller la taille/le coût Redis à mesure que les `examRecord:*`
      s'accumulent (sans TTL) ; envisager un stockage objet (ex. Vercel Blob)
      pour le classement complet si le volume le justifie.

### Phase 3 — Valider avant/pendant la montée en charge réelle

- [ ] Test de charge ciblé (N salles actives en lobby et en résultats) pour
      obtenir de vrais chiffres de volume Upstash / coût Vercel.
- [ ] Réévaluer un modèle push (SSE, puis WebSocket/PartyKit/Pusher) — option
      documentée, à ne déclencher que si le polling optimisé ne suffit pas.

---

## ⚪ Hors scope (différé volontairement, documenté dans les specs)

Décisions déjà prises pour rester simple — à révisiter seulement si le
besoin se confirme, pas des oublis.

- Pas de vérification d'email bloquante à l'inscription (compte utilisable
  immédiatement).
- Pas de retry/queue pour les emails transactionnels non délivrés.
- Pas de gestion des remboursements (refunds) Stripe.
- Pas de facture/reçu PDF pour les recharges (l'historique suffit).
- Pas de moyens de paiement mobile money malgaches (Mvola/Orange/Airtel) —
  l'abstraction `payments.js` le permettra sans changement de la couche
  solde/examen le jour venu.
- Pas de limite de recharge par période (anti-fraude).

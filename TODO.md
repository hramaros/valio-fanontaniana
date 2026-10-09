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

## 🔵 Fonctionnalités livrées — bibliothèque, programmation, import

### Bibliothèque de quiz (`src/lib/quizzes.js`) — ✅
Un quiz n'existait que dans une salle, détruite au bout de 2 h : le formateur
ressaisissait tout à chaque cours, et rien ne pouvait survivre assez longtemps
pour être programmé ou importé. `quiz:{id}` sans TTL + ZSET
`quizzes:acct:{id}` scoré par `updatedAt`. Écran « Mes quiz » (`/host/quiz`) :
lancer, programmer, dupliquer, modifier, supprimer.

### Examens programmés (`src/lib/scheduled.js`) — ✅
- **Aucun cron.** Les transitions sont déclenchées par le premier accès après
  l'heure, sous `withLock`. Un test vérifie que 30 accès simultanés ne créent
  qu'une seule salle.
- **Deux heures et non une.** `registerPlayer` ferme les inscriptions dès que
  la partie est lancée : ouvrir et lancer au même instant aurait exclu tout le
  monde sauf le premier arrivé. La salle ouvre en lobby à `startsAt`, le chrono
  part à la fin d'une fenêtre d'inscription (5 min par défaut).
- **Code réservé dès la programmation** (`codeReservation.js`), pour être
  distribué à l'avance ; `createRoom` ne peut plus le réattribuer.
- Questions figées, roster de classe relu à chaud (un élève inscrit entre-temps
  doit pouvoir passer), repli sur le roster figé si la classe a été supprimée.
- Solde insuffisant au départ du chrono : phase « bloqué » **non définitive**,
  la salle et les inscrits sont préservés, une recharge débloque.
  `scheduledAffordability` prévient le formateur en amont, puisqu'une salle qui
  s'ouvre seule n'a personne pour recharger.

### Import Google Forms (`src/lib/gformsImport.js`) — ✅ validé sur formulaires réels
Par **lien public** et non par l'API : le scope `forms.body.readonly` est
sensible et exige une vérification Google (plusieurs semaines) — l'OAuth
restera le second chemin.

- **Barrière anti-SSRF** : liste blanche d'hôtes (`docs.google.com`,
  `forms.gle`), HTTPS seul, et `redirect: "manual"` avec revalidation à chaque
  saut — laisser suivre les redirections annulerait la liste blanche. Limitation
  de débit par **compte** et non par IP (un établissement partage une adresse).
- **Rien n'est persisté par l'import** : un formulaire qui n'est pas un
  « questionnaire » n'a aucune bonne réponse, et `validateQuiz` le refuserait.
  Le quiz passe par l'éditeur, où le formateur complète, puis enregistre.
- **Ce qui n'est pas repris est signalé** (échelle, grille, date, type inconnu…)
  avec la raison, plutôt que perdu en silence.
**Validé de bout en bout sur quatre formulaires réels** (un formulaire de test
créé puis supprimé, et les trois sondages du projet) : 38, 30 et 25 questions
extraites, titres et types corrects. Ce que cette validation a appris :

- **Forme de l'URL** : `/forms/d/{id}/viewform` répond ; `/forms/d/e/{id}/viewform`
  renvoie 404, car le créneau `/d/e/` attend un identifiant de *publication*,
  différent de l'identifiant de formulaire. Les deux formes sont acceptées en
  entrée, donc le message d'erreur cite le partage ET le lien.
- **Option « Autre »** : Google la représente par une option à texte vide
  portant un drapeau `1` en 5e position. Elle est désormais écartée par ce
  drapeau, et non par le seul effet du filtre sur les textes vides — qui
  fonctionnait par accident. Une question réduite à une option plus « Autre »
  est signalée comme telle, et non par un vague « moins de deux réponses ».
- **Structure vs perte réelle** : les titres de section et les images gonflaient
  le rapport à « 9 éléments non repris » là où 1 seul demandait une ressaisie.
  Les deux catégories sont séparées (`critique`), et l'interface met les pertes
  en avant, la mise en page dans un replié.
- **404 / 410** : indistinguables côté serveur d'un formulaire non partagé ou
  supprimé ; même message, qui mentionne les deux causes.

- [ ] **Extraction du corrigé : encore non validée en réel.** Aucun des
      formulaires disponibles n'est configuré en « questionnaire », et le MCP
      Google Forms n'expose pas le `batchUpdate` qui permettrait d'activer le
      mode quiz et de poser un corrigé. Ce chemin reste donc couvert par des
      structures synthétiques. **L'échec serait bénin** : la recherche du
      corrigé est défensive, et si la forme diffère elle ne trouve simplement
      aucune bonne réponse — l'import aboutit, et le formateur les désigne dans
      l'éditeur, exactement comme pour un formulaire de sondage. À lever en
      créant un questionnaire noté à la main.
- [ ] Second chemin OAuth (API Forms officielle), une fois la vérification
      Google obtenue — à enchaîner avec EIN/Stripe, même file d'attente de
      démarches externes.
- [ ] Notifier les participants d'un examen programmé. Hors de portée
      aujourd'hui : le roster d'une classe ne contient que des noms, pas
      d'adresses. Suppose une collecte d'emails élèves, donc une décision
      produit (et RGPD) préalable.

## 🟢 Feuille de route de scalabilité (50k+ utilisateurs / 2M+ examens)

Issue de l'audit de scalabilité complet (Phase 0 — bugs de concurrence —
déjà livrée : verrou Redis sur la clôture d'examen et sur credit/debit).
Rien ci-dessous n'est planifié pour une implémentation immédiate ; à
séquencer selon la croissance réelle.

### Phase 1 — Réduire le coût du polling (le plus gros levier)

- [x] **Cadences relâchées et centralisées** (`src/lib/polling.js`, 2026-09-09).
      Tous les écrans étaient à ~1,2 s. Or les surfaces PARTICIPANT sont
      multipliées par le nombre d'élèves : à 20 participants, la seule phase de
      jeu pesait ~63 % des commandes Redis d'une séance. Le poller de `/play`
      ne sert qu'à détecter une clôture anticipée (le chrono est calculé côté
      client), il est donc passé à 3 s ; `/join` reste à 2 s car le lancement
      est la transition visible. Résultat : ~47 000 → ~22 000 commandes par
      évaluation de 20 participants, soit 11 → 23 évaluations dans le palier
      gratuit Upstash. Chiffrage et seuils dans
      [`.agents/tarification.md`](.agents/tarification.md).
- [x] **Pause sur onglet caché** (`usePolling`, Page Visibility API). Un élève
      qui met son navigateur en arrière-plan — cas très fréquent sur mobile —
      ou un onglet projeté laissé ouvert ne coûtaient rien de moins qu'un
      onglet actif. Au retour, rafraîchissement immédiat et retour à la cadence
      de base.
- [x] **Backoff adaptatif**, activé sur `/host/lobby` (plafond 6 s) et
      `/result` (8 s). La boucle est passée d'un `setInterval` fixe à un
      `setTimeout` auto-replanifié, et purge toujours le timer en cours avant
      d'en poser un — sinon un retour d'onglet pendant une requête en vol
      laissait deux boucles tourner, ce qui *doublait* la charge.
      **Le backoff exige une `signature`** fournie par l'appelant : la charge
      utile de `/state` contient `serverNow: Date.now()`, donc comparer l'objet
      entier aurait toujours vu un changement et le backoff ne se serait jamais
      enclenché. Volontairement **absent** de `/join` (ce que l'élève attend —
      le lancement — EST le changement : ralentir retarderait le moment le plus
      visible du parcours), de `/play` et de `/host/results`.
- [x] **Un poller au lieu de deux sur `host/results/page.jsx`** — résolu
      autrement que prévu. Plutôt que de fusionner les endpoints, il suffisait
      de constater que `/results` portait déjà statut, mode, capacité et prix :
      seuls les trois champs de chrono manquaient. `getLeaderboard` les expose
      désormais (`startedAt`, `durationMs`, `serverNow`) et le poller `/state`
      est supprimé — un tiers de requêtes en moins sur l'écran que le formateur
      laisse ouvert le plus longtemps, sans nouvel endpoint ni refonte du
      verrou de clôture. Un test garde ces champs : s'ils disparaissent, le
      chrono formateur casse en silence.
- [x] **Correction en masse** (`gradeFreeAnswersBulk`,
      `POST /api/host/[code]/grade-bulk`, boutons « tout accorder / tout
      refuser » par question). La salle est lue une fois et les corrections sont
      **regroupées par joueur** : un seul cycle lecture/écriture par élève quel
      que soit le nombre de rédactions corrigées pour lui, et le score
      recalculé une fois à la fin. Plafonné à `BULK_GRADE_MAX` (200). Les
      entrées invalides sont signalées dans `skipped` sans faire échouer le
      lot.
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
      impossible pour les paiements déjà détruits par l'ancien TTL. Reconstruit
      aussi les index scopés `exams:acct:`, `exams:class:` et `txns:acct:`,
      dans la **même** passe que les index globaux (les documents sont déjà en
      main, un second `SCAN` ne rapporterait rien).
      **À exécuter une fois en production** — sans quoi les index ne
      contiennent que l'activité postérieure à leur mise en service.
- [x] **Listes scopées plafonnées → Sorted Sets** (`src/lib/scopedIndex.js`).
      `examHistory:{accountId}`, `classExams:{classId}` et
      `txnHistory:{accountId}` étaient des listes `LPUSH` + `LTRIM 0 199`. Le
      plafond ne libérait **rien** : les documents pointés (`examRecord:*`,
      `txn:*`) n'ont pas de TTL et survivaient à leur éviction. La 201e entrée
      rendait donc la première **inaccessible sans la supprimer** — sur un
      carnet de notes de classe, une pièce justificative d'examen, et surtout
      une écriture comptable. Remplacées par des ZSET scorés par date
      (`exams:acct:`, `exams:class:`, `txns:acct:`), sans troncature.
      - `txnHistory` n'était pas dans le périmètre initial : même bug, sur des
        données financières, juste après l'épisode du TTL — corrigé aussi.
      - **Curseur composite `(date, id)`** et non date seule : plusieurs
        entrées peuvent partager la milliseconde de fin de page, et une borne
        purement datée les écarterait toutes d'un bloc. Verrouillé par un test
        qui échoue sans le départage.
      - **Transition sans ordre imposé** : les lectures fusionnent le ZSET et
        la liste héritée (dédoublonnées), si bien que le déploiement et le
        rattrapage peuvent arriver dans n'importe quel ordre sans qu'une entrée
        disparaisse. Le complément hérité pourra être retiré de
        `scopedIndex.js` une fois le rattrapage passé et vérifié.
      - Pagination exposée jusqu'à l'interface : « Voir les examens plus
        anciens » (`/host/history`) et « Voir les recharges plus anciennes »
        (`/host/wallet`).
- [x] **Bornes de `ZRANGE ... BYSCORE REV` inversées** (`src/lib/indexes.js`) —
      bug de production trouvé en bâtissant la pagination ci-dessus. Redis
      attend `ZRANGE key <max> <min> BYSCORE REV` et le client Upstash transmet
      les bornes positionnellement, sans réordonner : `idsBetween`/
      `entriesBetween` demandaient « score >= to ET <= from », soit un
      intervalle **toujours vide**. Tout l'espace admin (`overviewData`,
      courbes, index globaux) ne renvoyait donc rien en production, alors que
      les tests passaient — le double de test ignorait `rev` dans le calcul des
      bornes. Double corrigé (12 tests sont alors tombés), puis appels corrigés.
      Le piège est documenté à l'endroit unique qui doit le connaître.
- [ ] Précalculer les agrégats du tableau de bord (`src/lib/analytics.js`)
      au lieu de recalculer sur jusqu'à 200 enregistrements à chaque
      chargement. En attendant, la route `/api/host/analytics` **dit** que les
      cumuls portent sur une fenêtre de 200 (`partial`), et le nombre d'examens
      reste exact (un `ZCARD`, sans rapatrier les documents) — un total partiel
      affiché comme un total était le vrai défaut.
- [x] **Plafond sur `classList:{accountId}`** — résolu **autrement** que par le
      `LTRIM` initialement prescrit, parce que ce pattern aurait causé une perte
      silencieuse : tronquer cette liste ne masque pas de vieilles données, elle
      rend des classes **inaccessibles** alors que leur `class:{id}` et le
      carnet de notes associé survivent dans Redis. C'est donc un **refus
      explicite à la création** au-delà de `MAX_CLASSES_PER_ACCOUNT` (200), avec
      un message clair. `deleteClass` faisant déjà un `LREM`, supprimer une
      classe libère la place — le plafond n'est pas définitif.
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

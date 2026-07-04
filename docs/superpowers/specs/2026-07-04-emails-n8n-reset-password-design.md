# Emails transactionnels (n8n) + réinitialisation de mot de passe — Design

## Contexte

Le produit n'envoie aujourd'hui aucun email. Trois besoins :

1. **Confirmation d'inscription** : email envoyé (via n8n) lors d'une inscription manuelle (email + mot de passe).
2. **Bienvenue** : email envoyé (via n8n) lors d'une inscription/connexion Google qui **crée** un nouveau compte.
3. **Réinitialisation de mot de passe** : flux complet (demande, token à usage unique, email via n8n, page de saisie du nouveau mot de passe).

Décisions validées avec l'utilisateur pendant le brainstorming :
- La confirmation d'inscription est une **notification simple**, non bloquante (pas de vérification d'email, le compte est utilisable immédiatement).
- Le contrat n8n est **conçu ici** (pas de webhook n8n préexistant) ; l'assistant **construit aussi le workflow n8n** (pas seulement le déclenchement côté app).
- Envoi email via **Gmail** (node Gmail natif n8n, OAuth2).
- Lien de reset valide **1 heure**.
- Réponse anti-énumération : message identique que l'email corresponde ou non à un compte.
- Un compte créé uniquement via Google peut utiliser le reset pour **définir un premier mot de passe**.
- Flux de reset dans une **page dédiée** `/reset-password?token=...` ; la demande initiale (« mot de passe oublié ») reste dans `AuthModal`.
- Après un reset, l'utilisateur **choisit** (case à cocher) s'il veut révoquer ses autres sessions actives — les deux comportements doivent donc être supportés.

## Architecture

### 1. Déclenchement n8n — `src/lib/notify.js` (nouveau, pur côté app)

Un point d'entrée unique :

```js
notify(event, payload) // event: "account_created" | "google_welcome" | "password_reset"
```

- `POST` vers `process.env.N8N_WEBHOOK_URL`, body `{ event, ...payload }`, header `x-valio-secret: process.env.N8N_WEBHOOK_SECRET`.
- `await` avec **timeout ~3s** (`AbortController`) : ne bloque pas indéfiniment si n8n est lent/down.
- Toute erreur (réseau, timeout, statut non-2xx) est **journalisée (`console.error`) et avalée** — jamais propagée à l'appelant. L'inscription, la connexion Google et le reset de mot de passe **réussissent toujours** indépendamment du sort de l'email.
- Aucune tentative de retry (pas de queue dans ce projet ; cohérent avec la philosophie « léger par défaut »).
- Reste indépendant de `src/lib/accounts.js` (qui reste pur/testable avec le faux Redis) : appelé depuis les **routes API**, pas depuis la couche métier.

Payloads par événement :
- `account_created` : `{ email, name }`
- `google_welcome` : `{ email, name }`
- `password_reset` : `{ email, name, resetLink, expiresInMinutes: 60 }`

Le **contenu/template** de chaque email est entièrement la responsabilité du workflow n8n (Section 4) ; le code applicatif ne fait que déclencher l'événement avec les données brutes.

### 2. Token de reset + endpoints (`src/lib/accounts.js`)

**Stockage Redis** : `passwordReset:<sha256(token)> → accountId`, **TTL 3600s**. Le token brut (32 octets aléatoires, `randomBytes(32).toString("hex")`, même schéma que les sessions) n'est **jamais stocké** — seul son hash SHA-256 sert de clé. Consommation **atomique** via la commande Redis `GETDEL` (une seule lecture possible, pas de fenêtre de race entre lecture et suppression).

Nouvelles fonctions dans `accounts.js` :
- `createPasswordResetToken(accountId) -> token` — génère le token, stocke le hash, retourne le token brut (une seule fois).
- `consumePasswordResetToken(token) -> accountId | null` — hash + `GETDEL`, retourne l'accountId si trouvé (donc encore valide et jamais utilisé), sinon `null`.
- `setPassword(accountId, newPassword) -> { ok, error? }` — même validation de longueur que `createAccount` (6 caractères min.), remplace `passwordHash` (fonctionne aussi pour un compte Google-only dont `passwordHash` est `null`).

**Index de sessions actives** (pour l'option de révocation) : nouvelle Redis SET `sessionsByAccount:<accountId>`, TTL glissant aligné sur `SESSION_TTL_SEC` (30j), maintenue par :
- `createSession(accountId)` : `sadd` du nouveau token dans le set + `expire` du set.
- `deleteSession(token)` : lit l'accountId associé avant suppression, puis `srem` du set.
- Nouvelle fonction `revokeOtherSessions(accountId, exceptToken)` : `smembers` du set, `del` de chaque clé `session:*` sauf `exceptToken`, puis le set est réduit à ne contenir que `exceptToken`.

**Nouvelles routes API** :
- `POST /api/auth/password-reset/request` `{ email }` → répond **toujours** `{ ok: true }` (anti-énumération). Si un compte existe pour cet email : génère le token, construit `resetLink = ${origin}/reset-password?token=...`, appelle `notify("password_reset", { email, name, resetLink, expiresInMinutes: 60 })`. Si aucun compte : ne fait rien (mais répond pareil).
- `POST /api/auth/password-reset/confirm` `{ token, password, revokeOtherSessions }` → `consumePasswordResetToken` (si `null` : `400 { error: "Lien invalide ou expiré." }`, sans distinguer expiré/déjà utilisé/jamais existé) → `setPassword` → `createSession` (connexion automatique, cookie posé comme au signup/login) → si `revokeOtherSessions` est vrai, `revokeOtherSessions(accountId, nouveauToken)`.

### 3. UI

**`AuthModal.jsx`** : sous le formulaire de connexion, lien « Mot de passe oublié ? » qui bascule un état local `forgot` (distinct de `login`/`signup`) : un champ email + bouton « Envoyer le lien » (appelle `password-reset/request`, affiche toujours un message de succès générique) + lien « Retour à la connexion ».

**Nouvelle page `/reset-password`** (`src/app/reset-password/page.jsx`, hors shell, registre sobre comme `/verifier`) :
- Lit `?token=` dans l'URL.
- Formulaire : nouveau mot de passe, confirmation, case à cocher « Se déconnecter des autres appareils » (**cochée par défaut**), bouton « Réinitialiser ».
- Sur succès : connecté automatiquement, redirection vers `/host`.
- Token absent/invalide/expiré : message d'erreur clair + lien vers l'accueil et vers « redemander un lien » (renvoie à `/` avec la modale en état `forgot` via un paramètre, ou simplement un lien texte invitant à relancer la demande depuis la page de connexion).

**Déclenchement des emails de bienvenue/confirmation** :
- `src/app/api/auth/signup/route.js` : après `createAccount` réussi, `notify("account_created", { email, name })`.
- `src/app/api/auth/google/callback/route.js` : uniquement dans la branche où `getOrCreateByEmail` **crée** un nouveau compte (pas à chaque reconnexion d'un compte existant) → `notify("google_welcome", { email, name })`. Nécessite que `getOrCreateByEmail` expose si le compte a été créé ou réutilisé (actuellement elle ne fait pas la distinction dans son retour — à ajouter, ex. `{ ok, account, created }`).

### 4. Workflow n8n (construit par l'assistant via les skills n8n)

Un workflow n8n :
1. **Webhook Trigger** (POST) — chemin dédié, ex. `/webhook/valio-notify`.
2. **IF** : vérifie le header `x-valio-secret` contre une variable/credential n8n (jamais en dur dans le node) ; sinon répond 401 et s'arrête.
3. **Switch** sur `{{$json.event}}` : trois branches (`account_created`, `google_welcome`, `password_reset`).
4. Par branche : un node **Edit Fields** qui prépare le sujet/corps du texte, puis un node **Gmail → Send Message**.
5. **Respond to Webhook** : `{ ok: true }`.

Prérequis côté utilisateur : un identifiant Gmail (OAuth2) déjà configuré dans l'instance n8n cible (l'autorisation OAuth initiale se fait dans l'UI n8n, pas via l'API). L'assistant sélectionne cet identifiant existant lors de la construction du workflow, suit le flux `get_sdk_reference` → `get_suggested_nodes` → `search_nodes` → `get_node_types` → écriture → `validate_workflow` → `create_workflow_from_code` → vérification de `get_workflow_details` (connexions), et publie (`publish_workflow`) une fois validé.

Une fois le workflow publié, son URL de webhook devient la valeur de `N8N_WEBHOOK_URL` côté app (Vercel env var), et un secret partagé généré est stocké à la fois côté n8n (credential/variable) et côté app (`N8N_WEBHOOK_SECRET`).

### 5. Tests & erreurs

- `notify.test.js` (nouveau) : `fetch` mocké — succès, timeout (AbortController déclenché), erreur réseau, statut non-2xx : dans tous les cas, `notify()` ne lève jamais et résout normalement.
- `accounts.test.js` (extension) : `createPasswordResetToken`/`consumePasswordResetToken` (usage unique — un 2ᵉ appel avec le même token retourne `null` ; expiration simulée) ; `setPassword` (compte normal et compte Google-only) ; `revokeOtherSessions` (les autres sessions deviennent invalides, la session exceptée reste valide).
- Route `password-reset/request` testée pour l'anti-énumération (même réponse, email existant ou non) — via un test d'intégration légère de la route ou directement sur la fonction métier sous-jacente.
- `npm test` et `npm run build` doivent rester verts.

## Hors scope (explicitement, pour rester simple)

- Pas de vérification d'email bloquante (compte utilisable immédiatement après inscription manuelle).
- Pas de retry/queue pour les emails non délivrés.
- Pas de rate-limiting dédié sur `password-reset/request` dans cette itération (déjà identifié comme item de la feuille de route de scalabilité — `@upstash/ratelimit` — mais pas un blocker pour livrer cette fonctionnalité).
- Le choix du provider email (Gmail) est fixé par ce design ; changer de provider plus tard ne change pas le contrat webhook côté app, seulement l'intérieur du workflow n8n.

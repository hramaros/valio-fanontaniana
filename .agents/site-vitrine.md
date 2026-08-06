# Site vitrine — valio-fanontaniana.mg

*Spécification du site de vente, séparé de l'application.*
*Créé le 2026-08-05.*

## Pourquoi deux domaines

| Domaine | Rôle | Public |
|---|---|---|
| **valio-fanontaniana.mg** (vitrine) | **Convaincre et vendre** — proposition de valeur, tarifs, preuve, SEO | Formateur qui ne connaît pas encore le produit · responsable pédagogique |
| **app.valio-fanontaniana.mg** (produit actuel) | **Faire le travail** — rejoindre une salle, créer et animer un examen | Participant (avec un code) · formateur déjà convaincu |

Ce découpage résout un problème structurel relevé dans
[`evaluation-marche.md`](./evaluation-marche.md) : l'application est — à juste titre —
**orientée participant** (« Un code, un pseudo, et c'est parti », principe de design n°4 de
[`PRODUCT.md`](../PRODUCT.md)), alors que **celui qui paie est le formateur**. Tant que les
deux publics partagent une seule page d'accueil, l'un des deux est mal servi.

La vitrine prend en charge la persuasion ; l'app reste **zéro friction** et n'a pas à
argumenter.

> **Conséquence importante :** ne **pas** ajouter de section « proposition de valeur
> formateur » sur `app.*`. Le seul lien nécessaire depuis l'app vers la vitrine est discret,
> pour le visiteur qui arrive sans savoir ce qu'est valio.

---

## Positionnement à porter

Le sujet n°1 de la vitrine est de **relever l'urgence** (4/10 dans l'évaluation de marché).
Le positionnement actuel décrit une *vitamine* (« un quiz ludique **et** noté ») ; la vitrine
doit vendre un *médicament*, ancré sur un moment de douleur daté :

> ### « Votre examen noté, prêt en PDF à la fin de l'heure — sans une soirée de correction. »

L'accroche produit actuelle (« Le quiz en direct façon Kahoot, mais qui produit une vraie note
/20 ») reste valable en **sous-titre explicatif**, pas en promesse principale.

**Statut : hypothèse non validée.** La Q6 du
[sondage](./sondage-validation-besoin.md) identifie le pic de charge réel (période de
contrôles / fin de trimestre / continu) et les Q8/Q11 en collectent les mots exacts. Ajuster
l'accroche dès les premières réponses, en réutilisant **leur vocabulaire**, pas le nôtre.

### Ton et vocabulaire

Repris de [`product-marketing.md`](./product-marketing.md) et [`DESIGN.md`](../DESIGN.md) —
non négociables :

- **Vouvoiement**, chaleureux, direct, concret, sans jargon.
- Registre **sobre et crédible** (c'est le côté formateur de la marque, pas le côté jeu). La
  couleur festive du quatuor de réponses reste dans les captures, pas dans le décor de la page.
- **Mots à utiliser** : quiz en direct, note /20, réponse libre, sans inscription, formateur,
  salle, code, classement, carnet de notes.
- **Mots à éviter** : « LMS », « plateforme e-learning complète », et tout jargon technique
  (serverless, Redis, polling) — invisible côté client.
- Identité malgache assumée : *valio* = « réponds », *fanontaniana* = « question ».

---

## Arborescence

### 1. Accueil (`/`) — la page qui fait tout le travail

Séquence recommandée, de haut en bas :

1. **Hero** — l'accroche « médicament » + sous-titre explicatif + CTA primaire
   « Créer un quiz gratuitement » (→ app) + CTA secondaire « Voir les tarifs ».
   Mentionner immédiatement **« gratuit, sans inscription »** : c'est ce qui désamorce
   l'objection n°1 (« encore un outil payant ? »).
2. **Le problème** — en une phrase et trois puces : les outils ludiques n'donnent pas de note
   exploitable ; les outils d'évaluation n'engagent personne ; dans les deux cas, on ressaisit
   les notes à la main.
3. **La solution en 3 étapes** — Créez votre quiz → Vos élèves rejoignent avec un code →
   Vous récupérez les notes /20 et le PDF. Avec une capture par étape.
4. **Ce qui nous rend différents** — les 4 différenciateurs, dans cet ordre :
   note /20 exploitable · réponses libres corrigées par vous · zéro inscription élève ·
   export PDF et code de vérification publique.
5. **Fonctionne dans vos conditions réelles** — connexions modestes, smartphones bas de gamme,
   projection au vidéoprojecteur. Argument très fort localement, à ne pas enterrer.
6. **Tarifs en résumé** — le tableau Entraînement / Examen (voir page dédiée) + « pas d'abonnement ».
7. **FAQ** — reprend les objections documentées dans `product-marketing.md`
   (voir la section *Objections* : outil payant, connexion instable, triche sur les réponses
   libres, pas de compte = pas de suivi).
8. **CTA final** — « Créez votre premier quiz, c'est gratuit ».

### 2. Tarifs (`/tarifs`)

Deux colonnes, sans abonnement, prix affichés **en Ariary d'abord** (USD en secondaire) :

| | **Entraînement** | **Examen** |
|---|---|---|
| Prix | **Gratuit à vie** | **1 000 Ar** / examen (≤ 20 participants) · **2 000 Ar** illimité |
| Compte | Aucun | Requis |
| Questions | QCM uniquement | QCM **+ réponses libres corrigées** |
| Participants | ≤ 10 | ≤ 20 ou illimité |
| Résultats | À l'écran | **Export PDF**, historique, classes, carnet de notes |

> Le mode gratuit s'appelle **Entraînement**, pas « Libre » : « mode Libre » se confondait avec
> les « réponses libres », qui sont justement la fonction réservée à l'Examen. (La valeur
> stockée côté code reste `MODE_LIBRE = "libre"`.)

Trois éléments à porter avec le prix, dans cet ordre :

1. **La garantie** — « Débité uniquement si l'examen va au bout ; une session interrompue n'est
   jamais facturée. » Ce n'est pas un argument ajouté : `rooms.js` ne règle la session que
   lorsqu'elle atteint le statut `ended`. C'est la réponse directe à l'objection « et si ça
   plante en pleine classe ? » — l'anxiété n°1 documentée dans `product-marketing.md`.
2. **Le premier examen offert** à l'inscription (`WELCOME_CREDIT_AR`) : on essaie sans payer.
3. **Des packs d'examens, pas des Ariary** — la recharge est présentée en nombre d'examens
   (5 · 20 +2 offerts · 50 +8 offerts). Le bonus est réellement crédité, jamais une « valeur »
   affichée à côté du prix.

Insister sur : **pas d'abonnement**, on ne paie qu'à l'usage, et le mode Entraînement reste
gratuit pour toujours.

> Les montants sont pilotés côté app par `src/lib/exam.js` (`PRICE_SMALL_AR`,
> `PRICE_UNLIMITED_AR`, `LIBRE_MAX`, `EXAMEN_SMALL_MAX`). **Garder les deux sources
> synchronisées** — un prix affiché faux sur la vitrine est un bug de confiance.
> Le prix réellement acceptable sera connu via les Q29/Q30 du sondage.

### 3. Comment ça marche (`/comment-ca-marche`)

Le parcours détaillé, côté formateur puis côté élève, avec captures. Couvre la phase de
correction en deux temps (chrono → correction des réponses libres → publication), qui est le
mécanisme différenciant et le plus difficile à comprendre sans démonstration.

### 4. Pour les établissements (`/etablissements`) — **à ne publier qu'après validation**

Page destinée au responsable pédagogique / RH : équiper N enseignants, cohérence des
évaluations, budget maîtrisé. C'est le levier le plus puissant sur le **plafond de prix**
(3/10 dans l'évaluation).

> **Ne pas construire cette page — ni la fonctionnalité — avant que le
> [sondage établissements](./sondage-etablissements.md) ne confirme l'appétit** (sa Q20 en
> particulier : la structure porterait-elle le sujet, ou le laisse-t-elle à chaque
> enseignant ?). Côté app, aucune notion d'organisation n'existe aujourd'hui
> (`src/lib/accounts.js` n'a ni équipe, ni rôle partagé, ni solde commun) : c'est un vrai
> chantier de modèle de données. En attendant, un simple formulaire « Vous êtes un
> établissement ? Parlons-en » suffit à mesurer la demande sans rien construire.

### 5. Vérifier un résultat (`/verifier`) — redirection

La consultation publique par code `VF-XXXX-XXXX` vit **dans l'app**
(`app.valio-fanontaniana.mg/verifier`). La vitrine se contente d'expliquer à quoi sert ce code
(parents, établissements, recruteurs) et de rediriger. Ne pas dupliquer la fonctionnalité.

### 6. Pages de confiance

- **À propos** — l'histoire et l'ancrage malgache. Sur un marché où « est-ce sérieux et
  durable ? » est une anxiété documentée, une page qui montre qui est derrière le produit vaut
  plus qu'un argumentaire.
- **Confidentialité** — argument de vente autant qu'obligation : les élèves **n'ont pas de
  compte**, les salles sont **éphémères**, les données collectées sont minimales.
- **Mentions légales** · **Contact**.

### 7. Blog / ressources — plus tard

Pas prioritaire tant que l'acquisition n'est pas validée (Q36 du sondage dit où se trouvent
réellement les formateurs). S'il est lancé un jour, viser les recherches de terrain :
« corriger un contrôle plus vite », « alternative gratuite à Kahoot », « quiz avec note /20 ».

---

## Boucle de conversion

Chaque session de quiz expose **des dizaines de participants** au produit : c'est le moteur
d'acquisition le moins cher dont dispose valio (le moteur historique de Kahoot), et il est
actuellement inexploité.

```
Participant termine un quiz  →  écran /result (app)
        ↓  « Vous êtes formateur ? »
   Site vitrine  →  Créer un quiz gratuit  →  app.*/host
        ↓
   Premier examen gratuit  →  compte  →  1ʳᵉ recharge de crédits
```

**Tous les liens sortants de l'app vers la vitrine portent des paramètres UTM** afin de mesurer
cette boucle. Côté app, c'est déjà outillé : `src/lib/marketing.js` expose
`marketingUrl(source)` qui construit l'URL taguée, et l'URL de base est configurable via
`NEXT_PUBLIC_MARKETING_URL`.

Sources déjà instrumentées : `result` (fin de quiz participant), `home` (accueil app).

---

## Recommandations techniques

- **Site statique** — pas de base de données, pas de Redis, pas d'authentification. Rien de ce
  qui fait l'app n'est nécessaire ici.
- **Projet et dépôt séparés** de l'app : cycles de vie différents, et une refonte marketing ne
  doit jamais pouvoir casser le produit.
- **Performance = argument commercial.** Le principe « léger par défaut » de `DESIGN.md`
  s'applique doublement : la cible est sur mobile modeste et connexion instable. Viser un
  chargement utile en < 2 s en 3G, images compressées, aucune police lourde, pas de carrousel.
- **Accessibilité** — même barre que l'app : WCAG AA, contraste ≥ 4.5:1, cibles ≥ 44 px.
- **Cohérence visuelle** avec l'app : réutiliser le vert de marque et la typographie de
  `DESIGN.md`. Le visiteur doit reconnaître le même produit en passant d'un domaine à l'autre.
- **DNS** : `valio-fanontaniana.mg` → projet vitrine ; `app.valio-fanontaniana.mg` → projet
  actuel. Prévoir la redirection de `www` vers l'apex.
- **SEO de base** : titres uniques, meta descriptions, Open Graph (les partages se font en
  WhatsApp/Facebook entre enseignants), `sitemap.xml`, données structurées
  `SoftwareApplication`, et surtout **balisage `lang="fr"`**.

---

## Mesure

Entonnoir à instrumenter de bout en bout, dans l'ordre de l'entonnoir AARRR :

| Étape | Où | Indicateur |
|---|---|---|
| Visite vitrine | vitrine | sessions, source |
| Clic CTA « Créer un quiz » | vitrine → app | taux de clic |
| Premier quiz lancé (Entraînement) | app | **activation** |
| Création de compte | app | |
| Premier examen payant | app | **conversion macro** |
| Recharge de crédits | app | revenu |
| Retour à J+7 / J+30 | app | rétention |

Le lien participant → vitrine (`utm_source=app&utm_content=result`) mesure spécifiquement la
**boucle virale** — c'est-à-dire le critère « coût d'acquisition » de l'évaluation de marché.

---

## Avant le lancement commercial

- [ ] Le **rail de paiement** fonctionne (EIN → compte Mercury → Stripe ; mobile money malgache
      ensuite). **Tant que ce point est ouvert, ne pas afficher de promesse d'achat immédiat** :
      la vitrine peut vendre le mode Entraînement et collecter des inscriptions, pas encaisser.
      Voir `TODO.md` et `src/lib/payments.js`.
- [ ] Les prix affichés correspondent à `src/lib/exam.js`.
- [ ] Captures d'écran à jour (lobby, podium, écran de correction, carnet de notes).
- [ ] Pages légales publiées.
- [ ] UTM vérifiés de bout en bout.
- [ ] Accroche ajustée aux verbatims des Q8/Q11, et calendrier calé sur la Q6.

## Ce qu'on ne met pas sur la vitrine

- Aucune fonctionnalité de l'app (pas de saisie de code, pas de connexion, pas de `/verifier`).
- Aucun chiffre de preuve inventé (« +1 000 formateurs ») : il n'y a **aucun utilisateur réel à
  ce jour**. Les témoignages viendront des pilotes recrutés par la Q40 du sondage.
- Aucune promesse de fonctionnalité non livrée (offre établissement, suivi longitudinal).

---

## Pendant la phase de validation

Tant que le sondage tourne, la vitrine peut servir de **canal de collecte** : un encart discret
« Vous êtes formateur ? Aidez-nous à construire le bon outil » pointant vers le Google Form de
[`sondage-validation-besoin.md`](./sondage-validation-besoin.md). Cela transforme le trafic
précoce — qui ne convertira pas encore, faute de paiement — en données de validation.

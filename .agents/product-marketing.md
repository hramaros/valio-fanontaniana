# Product Marketing Context — valio.fanontaniana

*Dernière mise à jour : 2026-07-29*
*Statut : V1 auto-rédigée à partir du code. Les `[À CONFIRMER]` attendent ta validation.*

**Documents liés :** [`evaluation-marche.md`](./evaluation-marche.md) (grille Personal MBA,
62/100) · [`site-vitrine.md`](./site-vitrine.md).

**Dispositif de recherche terrain — trois publics, trois questionnaires**, délibérément
séparés : leurs douleurs, leur vocabulaire et leurs critères n'ont rien de commun, et les
fusionner produirait des moyennes vraies pour personne.

| Questionnaire | Public | Ce qu'il tranche |
|---|---|---|
| [`sondage-validation-besoin.md`](./sondage-validation-besoin.md) | **Formateur** — utilisateur et payeur | Le besoin, le parcours, l'offre individuelle |
| [`sondage-etablissements.md`](./sondage-etablissements.md) | **Établissement** — acheteur qui n'utilise pas | L'offre établissement, et l'anti-persona |
| [`sondage-parents.md`](./sondage-parents.md) | **Parent** — ni utilisateur ni acheteur | La fiche vérifiable, le risque « données de l'enfant », la prescription |

Les trois demandent **l'e-mail, et rien d'autre** — ni nom, ni établissement, ni téléphone — et
alimentent la base de contacts. La finalité est écrite dans l'intitulé de la question, ce qui
évite une case de consentement séparée. Chacun signale ce que l'identification coûte en
franchise sur ses questions sensibles, laissées facultatives pour cette raison.

## Product Overview
**One-liner :** Le quiz en direct façon Kahoot — mais qui produit une **vraie note /20** et accepte les **réponses libres** corrigées par le formateur.
**What it does :** Application web où un formateur lance un quiz en direct. Les participants rejoignent une salle avec un **code** + un **pseudo**, sans aucune inscription, et répondent à leur rythme sous un chrono global unique. Chaque session donne à la fois un **score de jeu** (justesse + rapidité, style Kahoot) et une **note /20** académique. Les questions à **réponse libre** sont validées manuellement par le formateur avant publication du classement, exportable en **PDF**.
**Product category :** Outil de quiz live & d'évaluation formative pour formateurs (live quiz + assessment).
**Product type :** SaaS web, 100 % serverless (Next.js + Upstash Redis, déployé sur Vercel). Sessions éphémères (salles à TTL, pas de compte).
**Business model :** **Freemium + pay-as-you-go (crédits), sans abonnement.**
- **Gratuit, sans compte** : quiz QCM (choix simple/multiple) en live, score + note /20 + classement à l'écran, **éphémère** (sans export ni persistance), **limité à 10 participants par salle**.
- **Pro, sur compte + crédits** : réponse libre, export PDF, persistance, logs d'examens, salles de classe, dashboard analytique.
- **Mode au choix à la création** : **Libre** (gratuit, sans compte, **≤ 10 participants**) ou **Examen** (pro). Le mode Examen débloque la réponse libre, fixe la **capacité** via un toggle (≤ 20 / illimité), et son **solde est débité en fin de session** (fin du chrono ou bouton « Terminer l'examen »). Le mode Libre ne consomme rien.
- **PAYG** : recharge d'un **porte-monnaie en Ariary**. Le plancher de recharge est
  **dynamique** : `max(500 Ar, 0,50 € convertis au taux du jour)` — soit **≈ 2 400 Ar** au taux
  de repli (4 800 Ar/€), recalculé à chaque demande (`api/wallet/topup/route.js`, `fxRate.js`).
  Il vient de la **commission plancher de Stripe (~0,50 €)**, pas d'une règle commerciale.
  *(Corrigé le 2026-08-05 : la valeur « min 5 $ ≈ 22 500 Ar » précédemment inscrite ici était
  fausse d'un facteur 10 et n'a jamais existé dans le code.)*
- **Packs de recharge** exprimés en examens, pas en Ariary : **5** · **20 (+2 offerts)** ·
  **50 (+8 offerts)**. Le bonus de volume est réellement crédité (`bonusAr` distinct du montant
  facturé, voir `payments.js` / `wallet.js`).
- **Premier examen offert à l'inscription** (`WELCOME_CREDIT_AR` = 1 examen) : le formateur
  vit la valeur complète avant qu'on lui parle d'argent.
- **Garantie** : le débit n'a lieu que si la session atteint le statut `ended` — **une session
  interrompue n'est jamais facturée** (`rooms.js`). Réponse directe à l'objection « et si ça
  plante en pleine classe ? ».
- **Prix par examen pro (selon la taille)** : **1 000 Ar (~0,22 $)** jusqu'à **20 participants** ; **2 000 Ar (~0,45 $)** pour un **nombre illimité** de participants.
- **Paiement** : mobile money (MVola / Orange Money / Airtel Money) **+** carte (Stripe / PayPal). Affichage **bi-devise** (MGA / USD selon la localisation).
- Levier de coût : infra quasi gratuite (serverless + Redis) → prix accessible.
- Détail complet : voir le plan business model dans `~/.claude/plans/unified-gliding-sketch.md`.

## Target Audience
**Target companies :** **Cœur de cible : formateurs & enseignants indépendants** (utilisateur = décideur = payeur). Cibles secondaires : centres/instituts de formation, écoles & universités, équipes formation/RH. **Marché francophone, Madagascar d'abord** (interface FR, nom malgache *fanontaniana* = « question », *valio* = « réponds »). Extension Afrique francophone possible.
**Decision-makers :**
- Formateur / enseignant (utilisateur **et** décideur en indépendant).
- Responsable pédagogique / direction d'établissement (achat multi-classes).
- Responsable formation / RH (usage entreprise).
**Primary use case :** Animer une séance de révision ou d'évaluation interactive **et** en sortir une note exploitable, sans ressaisie.
**Jobs to be done :**
- Engager / capter l'attention des apprenants (côté ludique).
- Évaluer et **noter** réellement (côté académique : /20, réponses libres).
- Garder une trace partageable des résultats (export PDF).
**Use cases :**
- Révision de chapitre en classe.
- Évaluation formative / examen blanc ludique.
- Quiz d'accueil / icebreaker en formation pro.
- Contrôle de connaissances avec questions ouvertes (réponses libres).

## Personas
| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| Formateur / enseignant (User + Champion) | Engagement de la classe, gain de temps de correction, note fiable | Outils ludiques sans note exploitable / outils d'éval pas engageants | Une seule session = jeu **+** note /20 **+** PDF |
| Responsable pédagogique (Decision Maker) | Adoption simple, cohérence des évaluations | Déployer un outil sans friction ni formation | Aucune inscription, prise en main immédiate |
| Direction / RH (Financial Buyer) | Coût, ROI, image moderne | Budget outils numériques limité | Prix accessible, infra légère, **offre établissement — hypothèse prioritaire, cf. ci-dessous** |

**Hypothèse « offre établissement » (priorité n°1 côté revenu).** Un responsable pédagogique
paie un accès pour N enseignants : ticket 10 à 50× supérieur au PAYG unitaire, et déplacement
du curseur du B2C micro vers le B2B2C. C'est le levier le plus rapide pour desserrer le
**plafond de prix** — la note la plus basse de [`evaluation-marche.md`](./evaluation-marche.md)
(3/10) — et il redresse simultanément la taille de marché utile et le potentiel d'upsell.
Statut : **non validée**. Deux instruments la testent, depuis les deux côtés :
- côté formateur, la **Q34** du [sondage formateurs](./sondage-validation-besoin.md)
  (« qui devrait payer ? ») ;
- côté acheteur, le [**sondage établissements**](./sondage-etablissements.md) tout entier —
  dont la **Q20** (« la structure porterait-elle le sujet, ou le laisse-t-elle à chacun ? »)
  suffit à elle seule à faire tomber l'hypothèse.

⚠️ Ce sondage teste aussi l'**anti-persona** décrit plus bas : si les établissements
demandent surtout des bulletins, des emplois du temps et du suivi d'absences, ils attendent un
logiciel de gestion scolaire — et la bonne décision est de **renoncer au segment**, pas
d'élargir le périmètre.

## Problems & Pain Points
**Core problem :** Les quiz live existants **engagent mais ne notent pas** vraiment (pas de /20, QCM uniquement) ; les outils d'évaluation classiques **notent mais n'engagent pas** ; et beaucoup sont chers ou pensés pour un contexte anglophone/US.
**Why alternatives fall short :**
- Pas de **note académique /20** exploitable directement.
- Pas de **réponse libre** corrigée (QCM only) → impossible d'évaluer une vraie rédaction courte.
- Freemium limité / tarifs élevés `[À CONFIRMER vs budget local]`.
- Pensés EN/US, lourds (comptes obligatoires, gros front).
**What it costs them :** Temps de correction manuelle, **double saisie** (quiz puis bulletin), désengagement des apprenants, friction d'inscription.
**Emotional tension :** Charge de correction, crainte de la triche, frustration d'outils inadaptés au terrain (connexion, budget, langue).

## Competitive Landscape
**Direct :** Kahoot!, Quizizz, Wooclap, Socrative, Mentimeter — engageants mais `[À CONFIRMER]` pas de note /20 native, réponses ouvertes limitées, tarifs/■freemium contraignants, inscription requise.
**Secondary :** Google Forms / Microsoft Forms — évaluent en asynchrone mais **aucun live**, aucune dimension ludique/temps réel.
**Indirect :** QCM papier + correction manuelle, lever de mains / ardoises — gratuit et habituel, mais chronophage et sans données.
*(Préciser, pour chacun, en quoi il échoue spécifiquement pour TES clients — à affiner avec des retours terrain.)*

## Differentiation
**Key differentiators :**
- **Score de jeu + note /20** dans une seule session (ludique **et** académique).
- **Réponses libres** avec **validation manuelle** par le formateur (au-delà du QCM).
- **Export PDF** (classement formateur + résultat individuel).
- **Zéro inscription** participant (code + pseudo), **ultra léger** (polling, serverless, salles éphémères) → adapté aux connexions limitées et au RGPD/données minimales.
- Interface **française** et identité **locale**.
**How we do it differently :** Une fin de session en deux temps quand il y a des réponses libres — chrono → **phase de correction** par le formateur → publication des notes et du classement.
**Why that's better :** Plus de double saisie ni de correction déconnectée du jeu ; l'évaluation sort prête à l'emploi.
**Why customers choose us :** `[À CONFIRMER avec verbatims clients]` Hypothèse : « le seul quiz live qui me donne directement une note exploitable, sans inscrire mes élèves ».

## Objections
| Objection | Response |
|-----------|----------|
| « Encore un outil payant ? » | Le **QCM live complet est gratuit à vie, sans compte** ; on ne paie qu'à l'usage (sans abonnement) pour les fonctions pro (réponse libre, persistance, export, analytics) |
| « La connexion en salle est instable » | Polling léger, pas de WebSocket, faible bande passante ; chacun répond à son rythme |
| « On peut tricher sur les réponses libres » | Le formateur **valide chaque réponse manuellement** avant publication |
| « Pas de compte = pas de suivi dans le temps » | Éphémère **par design** ; export PDF pour archiver. `[Suivi historique = évolution future ?]` |

**Anti-persona :** Établissement qui veut une **LMS complète** (banque de questions partagée, suivi longitudinal, SSO entreprise, intégrations notes officielles). valio est volontairement léger et éphémère — pas un LMS.

## Switching Dynamics
**Push :** Correction chronophage, double saisie quiz→bulletin, apprenants passifs avec les outils classiques.
**Pull :** Jeu **+** note /20 **+** PDF en une session ; aucune inscription ; gratuit/léger.
**Habit :** Kahoot/Quizizz déjà installés dans les habitudes ; QCM papier.
**Anxiety :** Fiabilité en salle, courbe d'apprentissage, prix, « est-ce sérieux/durable ? ».

## Customer Language
**How they describe the problem :** `[À COLLECTER — verbatims réels de formateurs]`
- ex. « Kahoot c'est fun mais après je dois quand même tout renoter à la main. »
**How they describe us :** `[À COLLECTER]`
- ex. « le quiz qui donne direct la note. »
**Words to use :** quiz en direct, note /20, réponse libre, sans inscription, formateur, salle, code, classement.
**Words to avoid :** « LMS », « plateforme e-learning complète », jargon technique (serverless, Redis…) côté client.
**Glossary :**
| Terme | Sens |
|------|---------|
| fanontaniana | « question » (malgache) — l'identité du produit |
| valio | « réponds » (malgache) |
| réponse libre | question ouverte saisie au clavier, corrigée manuellement |
| note /20 | note académique = bonnes réponses / total ×20 |

## Brand Voice
**Tone :** Chaleureux, encourageant, énergique mais sérieux sur l'évaluation. (UI actuelle en **vouvoiement**.)
**Style :** Direct, simple, concret, francophone, sans jargon.
**Personality :** Ludique · Accessible · Fiable · Local · Malin.

## Proof Points
**Metrics :** `[À COMPLÉTER — produit récent, à mesurer : nb de quiz lancés, participants/session, taux de complétion]`
**Customers :** `[À COMPLÉTER — premiers formateurs / établissements pilotes]`
**Testimonials :** `[À COLLECTER]`
**Value themes :**
| Theme | Proof |
|-------|-------|
| Jeu + note en une session | Score Kahoot **et** note /20 + export PDF |
| Évaluer l'ouvert, pas que le QCM | Réponses libres validées manuellement |
| Zéro friction | Code + pseudo, aucune inscription |

**Hypothèse de repositionnement « médicament » (à valider).** Le positionnement actuel
(« quiz ludique **et** noté ») décrit une **vitamine** : la douleur est réelle mais différable,
d'où la note d'urgence la plus basse de l'évaluation de marché (4/10). Piste testée par le
sondage : ancrer la promesse sur un **moment brûlant et daté** —

> « Votre examen noté, prêt en PDF à la fin de l'heure — sans une soirée de correction. »

L'urgence ne se décrète pas, elle se fabrique en s'attachant à un pic de charge.
**Q6** du sondage identifie ce pic (période de contrôles / fin de trimestre / continu) ; **Q8 et Q12**
en collecte les verbatims. Ce cadrage ne remplace pas le positionnement ci-dessus tant qu'il
n'est pas confirmé — il s'y ajoute comme angle de messaging à tester.

## How to Reach Them
`[À COLLECTER — Q37 du sondage]` Aucun canal validé à ce jour ; ne pas inventer de plan
d'acquisition avant les réponses. Hypothèse structurelle en attendant : chaque session expose
des dizaines de participants au parcours « code + pseudo », soit une **boucle virale
intégrée** (le moteur historique de Kahoot) — à confirmer par la Q37 (canal de découverte) et
la Q27 (en parleriez-vous à un collègue ?).

## Goals
**Business goal :** Acquérir une base de formateurs actifs sur le gratuit, puis les convertir au **pro PAYG** (1ʳᵉ recharge de crédits).
**Conversion action :** Macro : **recharger des crédits et lancer un 1ᵉʳ examen pro**. Activation amont : créer et lancer un quiz gratuit. Action participant : rejoindre une salle.
**Current metrics :** `[À COMPLÉTER — produit récent]`
**Préalable bloquant à la monétisation :** aucun rail de paiement local n'est actif — Stripe
n'accepte pas Madagascar comme pays d'immatriculation marchand (`TODO.md:27`) et le mobile
money malgache est hors scope (`TODO.md:168`). Tant que ce point est ouvert, la conversion
macro ci-dessus est **inexécutable**. L'effort est toutefois contenu : `src/lib/payments.js:47`
expose déjà un registre de providers (`registerProvider`, interface
`{ initiate(txn), handleWebhook(request) }`). La **Q35** du sondage dit quel rail activer en
priorité (MVola / Orange Money / Airtel Money / carte).

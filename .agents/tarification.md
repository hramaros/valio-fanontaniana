# Tarification — décision et calculs

*Rédigé le 2026-09-09. Remplace l'hypothèse « 20 000 Ar par enseignant et par an ».*

## Ce qui a changé, et pourquoi

L'hypothèse initiale — **20 000 Ar par enseignant et par an** — est écartée pour deux raisons
mesurées, pas d'opinion.

### 1. Elle transformait l'upsell en remise

Le point de bascule contre le paiement à l'acte (1 000 Ar / évaluation) est à **20 évaluations
par an**. Au-delà, l'offre établissement revient **moins cher** que le PAYG :

| Fréquence (Q5 du sondage formateurs) | Évaluations/an | PAYG | Établissement | Écart |
|---|---|---|---|---|
| Quelques fois par an | 5 | 5 000 Ar | 20 000 Ar | +300 % |
| 1 à 2 fois par mois | 15 | 15 000 Ar | 20 000 Ar | +33 % |
| **≈ 1 fois par semaine** | **36** | **36 000 Ar** | **20 000 Ar** | **−44 %** |
| Plusieurs fois par semaine | 72 | 72 000 Ar | 20 000 Ar | −72 % |

Le cœur de cible — l'enseignant qui évalue chaque semaine — payait **moitié moins** via
l'établissement. Or cette offre existait précisément pour desserrer le plafond de prix
(critère 3 de `evaluation-marche.md`, noté 3/10, le plus faible). Elle l'abaissait.

### 2. Le coût dominant n'est plus l'infrastructure

| Poste | Annuel | Part |
|---|---|---|
| Salarié (200 €/mois, phase de pilotage) | 2 400 € | **97 %** |
| VPS (6 €/mois, tout compris) | 72 € | 3 % |
| Upstash Redis (palier gratuit, début) | ~0 € | — |
| **Total** | **2 472 €** = 11 865 600 Ar | |

Le prix ne finance plus des serveurs : il finance **une personne**. C'est un contrat de
service, pas une licence logicielle — et cela change ce qu'on vend.

## La décision

**Abonnement annuel forfaitaire : 1 500 000 Ar (~312 €).**
Enseignants et évaluations **illimités**, accompagnement à la mise en route inclus.
Pas de tarif par tête, pas d'engagement de durée.

| Prix | € | Étab. pour couvrir 2 472 € | Marge à 10 étab. |
|---|---|---|---|
| 1 000 000 Ar | 208 € | 11,9 — au-delà du plafond | −389 € |
| 1 200 000 Ar | 250 € | 9,9 — aucune marge d'erreur | +28 € |
| **1 500 000 Ar** | **312 €** | **7,9 ✓** | **+653 €** |
| 1 800 000 Ar | 375 € | 6,6 | +1 278 € |

**Pourquoi 1 500 000 Ar** : couvre les coûts dès 8 clients, soit deux de marge avant le
plafond réaliste de 10 — indispensable pour absorber un départ. À 1 200 000 Ar il faudrait les
10 simultanément, sans le moindre défaut.

Le montant reste dans la tranche « 500 000 à 2 000 000 Ar » de la Q14 du sondage — la deuxième
sur six.

### La condition qui rend ce prix tenable

À 1 500 000 Ar forfaitaires, une structure de 5 enseignants paierait 300 000 Ar par tête contre
~36 000 Ar en PAYG. **Sur une logique d'évaluations, c'est injustifiable.**

Ce prix ne tient que si l'on vend autre chose : formation des enseignants, mise en route, un
interlocuteur joignable, facture et contrat (exigés par la Q26). **Le salarié est le produit ;**
le logiciel est le moyen de le livrer.

Corollaire : **viser des structures de 20 enseignants et plus.** Une école de 5 profs n'est pas
le client cible — c'est un pilote.

## Tarif pilote

**600 000 Ar (125 €)** pour les 3 premiers clients, affiché comme temporaire afin de pouvoir
appliquer la grille normale au renouvellement sans négociation.

**Facturer le pilote, ne pas l'offrir.** Un client qui paie donne des retours exploitables ; un
client gratuit déprioritise.

## Les deux prévisions

### Pilotage (établissements seuls)

| An | Étab. | Recette | Salaire finançable |
|---|---|---|---|
| 1 | 2 | 625 € | 46 €/mois |
| 2 | 5 | 1 562 € | 124 €/mois |
| 3 | 10 | 3 125 € | 254 €/mois |

**200 €/mois n'est atteignable qu'en année 3.** Le viser dès l'année 1 ouvre un déficit cumulé
d'environ 1 850 € sur deux ans. La réponse saine : **indexer le salaire sur la recette** plutôt
que le fixer d'avance.

### Rentabilité (avec le PAYG individuel)

| An | Étab. | Formateurs PAYG | Recette | Salaire finançable |
|---|---|---|---|---|
| 1 | 2 | 50 | 1 000 € | 77 €/mois |
| 2 | 5 | **150** | 2 688 € | **218 €/mois ✓** |
| 3 | 10 | 300 | 5 375 € | 442 €/mois |

**Le PAYG individuel n'est pas un complément, c'est le moteur.** Un formateur actif rapporte
7,50 €/an sur la même infrastructure, sans coût marginal. Le plafond de 10 établissements ne
s'applique pas aux formateurs : c'est là qu'est la croissance, et la boucle virale
participant → formateur y travaille déjà (`src/lib/marketing.js`).

## Infrastructure — seuils de bascule

**Upstash sort du palier gratuit dès le premier établissement** de 10 profs actifs (945 000
commandes/mois contre 500 000 offertes). Mais le coût reste marginal : 0,89 $/mois à
1 établissement, 4,67 $ à 3. **Il n'égale le VPS qu'à ~4 établissements** — c'est là le
déclencheur de migration vers un Redis auto-hébergé, pas la couverture d'une infrastructure
haute disponibilité.

**Optimisation appliquée le 2026-09-09** : les cadences de polling ont été relâchées
(`src/lib/polling.js`), ce qui divise la charge Redis par deux — ~47 000 → ~22 000 commandes par
évaluation de 20 participants, soit 11 → 23 évaluations dans le palier gratuit.

### Ce que l'auto-hébergement déplacera hors facture

- **Le client Redis devra changer.** `@upstash/redis` parle REST ; un Redis auto-hébergé parle
  le protocole natif. Soit basculer sur `ioredis`/`node-redis` (l'interface est déjà abstraite
  via `testFakeRedis.js`, mais attention à la sérialisation JSON automatique qu'Upstash fait et
  que les clients standard ne font pas), soit poser un proxy REST compatible.
- **Les sauvegardes deviennent votre responsabilité.** `history.js` stocke les examens **sans
  TTL** — c'est l'actif durable, celui du carnet de notes. Sans persistance configurée et
  sauvegardée, un redémarrage l'efface.
- **Une panne pendant une évaluation coûte double.** Pas de haute disponibilité sur un VPS
  unique, et la garantie « débité seulement si l'évaluation va au bout » signifie qu'une
  interruption ne facture rien : perte de recette *et* de confiance, en classe.

## Ce qui reste ouvert

- **Le domaine `.mg` n'est pas chiffré.** À 97 % de coûts salariaux il ne change plus
  l'équation, mais il reste à budgéter.
- **Le plafond de 10 établissements est une hypothèse**, pas une donnée.
- **La Q20 du sondage établissements n'a aucune réponse.** Si « la structure porterait le
  sujet » ne ressort pas majoritaire, ce n'est pas le prix qu'il faut revoir : c'est
  l'existence du segment.
- **Aucun modèle d'organisation n'existe dans le code** (`accounts.js` n'a ni équipe, ni solde
  partagé). À n=1, servir manuellement — `credit()` et `topupTest()` suffisent, sur le patron de
  `scripts/promote-admin.mjs`. Ne rien construire avant que la demande soit prouvée.

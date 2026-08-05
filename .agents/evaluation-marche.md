# Évaluation de marché — valio.fanontaniana

*Grille des 10 critères de Josh Kaufman (*The Personal MBA*).*
*Rédigé le 2026-07-29 — score total : **62/100**.*

> ## ⚠️ Statut : hypothèses, pas constats
>
> **Aucun client réel n'a encore répondu.** Les notes ci-dessous sont des *hypothèses de
> fondateur* déduites du code, de [`product-marketing.md`](./product-marketing.md) et de
> [`TODO.md`](../TODO.md) — pas des données terrain. Le niveau de confiance est indiqué pour
> chaque critère, et [`sondage-validation-besoin.md`](./sondage-validation-besoin.md) est
> l'instrument qui doit les confirmer ou les infirmer.
>
> À relire et re-scorer **après le dépouillement du sondage**.

## Synthèse

Barème Kaufman : **< 50 = à éviter · 50-75 = viable mais fragile · > 75 = prometteur**.

| # | Critère | Note /10 | Confiance | Verdict express |
|---|---|---|---|---|
| 1 | **Urgence** | 4 | Faible | Vitamine plus que médicament — douleur réelle mais supportée |
| 2 | **Taille du marché** | 5 | Faible | Immense en absolu, mince pour le sous-ensemble *payeur + équipé + joignable* |
| 3 | **Prix possible** | 3 | Moyen | Plafond micro (0,22-0,45 $/examen) — talon d'Achille structurel |
| 4 | **Coût d'acquisition** | 6 | Moyen | Viralité participant intégrée (comme Kahoot) — vrai atout |
| 5 | **Coût pour délivrer la valeur** | 9 | Élevé | Serverless + Redis → coût marginal quasi nul |
| 6 | **Originalité de l'offre** | 7 | Moyen | Combinaison unique en local, mais imitable par les gros |
| 7 | **Rapidité de mise sur le marché** | 9 | Élevé | Produit déjà quasi prêt — atout majeur |
| 8 | **Investissement initial** | 8 | Élevé | Déjà largement engagé, reste surtout le paiement |
| 9 | **Potentiel de vente additionnelle** | 6 | Moyen | Recharges PAYG + paliers, mais bridé par le prix bas |
| 10 | **Potentiel de résistance** | 5 | Moyen | Besoin evergreen, mais faible verrou (éphémère par design) |
| | **TOTAL** | **62/100** | | **Zone grise haute — viable, à muscler sur 3 leviers** |

### L'insight central

Les trois critères que Kaufman tient pour **les plus déterminants** — urgence, taille de
marché, prix possible — sont exactement les **trois notes les plus basses** de valio
(4, 5, 3).

> **valio est fort là où c'est facile** (livraison 9, rapidité 9, investissement 8 : le produit
> est déjà bâti et ne coûte quasi rien à opérer) **et faible là où c'est décisif.**

C'est le vrai sujet stratégique — et la raison d'être des améliorations A→E plus bas.

---

## Détail par critère

**1 · Urgence — 4/10** *(confiance faible)*
Corriger et noter est une tâche **récurrente mais différable**. Le formateur a déjà un
contournement : Kahoot pour l'engagement + ressaisie manuelle de la note, ou le QCM papier.
La douleur « double saisie » est documentée dans le brief, mais on *vit avec*. Les pics
d'urgence sont concentrés sur les périodes de contrôles et d'examens.
→ *C'est un « nice to have » qu'il faut transformer en « must have » sur un moment précis.*

**2 · Taille du marché — 5/10** *(confiance faible)*
En absolu, les enseignants francophones se comptent en millions. Mais le marché **adressable
et solvable** du beachhead est étroit : le chiffre qui compte n'est pas « enseignants
malgaches » mais « enseignants malgaches équipés, connectés, **et prêts à payer en ligne**
pour un outil pédagogique ». Ce sous-ensemble est à ce jour inconnu (`[À COMPLÉTER]` dans le
brief).

**3 · Prix possible — 3/10** *(confiance moyenne)*
**Le point faible structurel.** 1 000-2 000 Ar par examen (~0,22-0,45 $) est un plafond
*micro* : même à fort volume, l'ARPU reste minuscule. Le modèle exige donc un **volume
massif** pour tenir — ce qui renvoie durement au critère 2. C'est un choix assumé
(accessibilité au budget local), mais il plafonne mécaniquement le revenu.

**4 · Coût d'acquisition d'un client — 6/10** *(confiance moyenne)*
Vrai atout : chaque session expose des dizaines de participants au parcours « code + pseudo ».
Boucle virale intégrée, exactement le moteur qui a fait Kahoot. Budget publicitaire = 0, mais
des boucles organiques existent déjà dans le produit. Bémol : convertir *formateur gratuit →
payant*, et atteindre les formateurs en amont, reste un effort non nul.

**5 · Coût pour délivrer la valeur — 9/10** *(confiance élevée)*
Excellence. Serverless (Vercel) + Redis (Upstash), salles éphémères, aucun bien physique, aucun
support humain par session → **coût marginal proche de zéro**. C'est précisément ce qui rend
soutenable le prix bas du critère 3.

**6 · Originalité de l'offre — 7/10** *(confiance moyenne)*
La combinaison *live + note /20 + réponse libre corrigée + zéro inscription + export PDF +
interface FR/identité locale* n'a pas d'équivalent direct. Mais chaque brique existe ailleurs :
le fossé est la **combinaison et la localisation**, imitable si Kahoot ou Quizizz ajoutaient la
notation — peu probable à court terme sur le marché malgache, d'où l'intérêt du local comme
douve.

**7 · Rapidité de mise sur le marché — 9/10** *(confiance élevée)*
Le produit est construit et quasi en production (lié à Vercel, stack fonctionnelle). Le
time-to-market est essentiellement **atteint** — seul le rail de paiement bloque la
monétisation complète (voir D).

**8 · Investissement initial — 8/10** *(confiance élevée)*
Le gros de l'investissement (développement) est déjà consenti. Reste : l'intégration d'un
moyen de paiement local + un amorçage marketing. Très faible au regard du standard SaaS.

**9 · Potentiel de vente additionnelle — 6/10** *(confiance moyenne)*
Les recharges de crédits PAYG **sont** un upsell naturel et répété — le modèle est
intrinsèquement transactionnel. Pistes complémentaires : palier illimité, classes / carnet de
notes, offre établissement multi-formateurs, banque de questions, analytics avancés. Plafonné
par le prix unitaire bas.

**10 · Potentiel de résistance — 5/10** *(confiance moyenne)*
L'évaluation est un besoin **evergreen** (chaque trimestre, chaque promotion). Mais la
défendabilité est modeste : coût de changement quasi nul pour le formateur, et
l'« éphémère par design » est **anti-verrou** — aucune donnée retenue = rien qui retienne le
client. Douves réellement mobilisables : la marque locale, la langue, et surtout les **rails de
paiement mobile money**, difficiles à répliquer pour un acteur américain.

---

## Améliorations prioritaires

Classées par levier × faisabilité. Elles ciblent les trois notes basses, car ce sont aussi les
plus déterminantes.

### A · Attaquer l'URGENCE (4 → 7) — repositionner sur un moment brûlant

Cesser de vendre « quiz ludique + note » (vitamine) et vendre :

> **« Votre examen noté, prêt en PDF à la fin de l'heure — sans une soirée de correction. »**

C'est un médicament, ancré sur un **déclencheur daté** (période de contrôles / d'examens).
L'urgence ne se décrète pas, elle se fabrique en s'attachant à un moment où le besoin est
aigu. → À injecter dans le hero de la landing et à confirmer par **Q8 et Q10** du sondage.

### B · Contourner le plafond de PRIX (3 → 5-6) sans trahir l'accessibilité

Le PAYG à l'unité plafonne l'ARPU. Deux leviers **additifs**, pas substitutifs :

- **Offre établissement / pack multi-formateurs** — un responsable pédagogique paie pour N
  enseignants : ticket 10 à 50× supérieur, et déplacement du curseur du B2C micro vers le
  B2B2C. C'est la voie la plus rapide pour redresser **les critères 2, 3 et 9 d'un coup**.
  Déjà pressenti dans le brief (`[À CONFIRMER offre établissement]`) → instrumenté par **Q22**.
- **Packs de crédits prépayés** avec léger avantage volume → augmente la valeur par
  transaction et lisse l'acquisition. **Livré le 2026-08-05** : paliers libellés en examens
  (5 · 20 +2 offerts · 50 +8 offerts), bonus réellement crédité.
  *(Cette ligne citait auparavant un « top-up minimum ~22 500 Ar » repris d'une erreur du
  brief ; le plancher réel est d'environ 2 400 Ar, imposé par la commission plancher de
  Stripe.)*

### C · Élargir la TAILLE utile (5 → 7) — expansion francophone séquencée

Madagascar est un **beachhead pour valider, pas un plafond**. Le brief évoque déjà l'extension
à l'Afrique francophone, et la douve « mobile money » (critère 10) se réplique justement pays
par pays — Orange Money couvre largement l'Afrique de l'Ouest.
Séquence : prouver rétention + volonté de payer à Madagascar (via le sondage), **puis**
dupliquer. → **Q2** du sondage segmente déjà Madagascar vs autre pays francophone.

### D · Débloquer le PAIEMENT — préalable non négociable

`TODO.md` documente deux points ouverts : Stripe n'accepte pas Madagascar comme pays
d'immatriculation marchand (`TODO.md:27`), et le mobile money malgache est hors scope
(`TODO.md:168`). Or **rien ne se monétise** tant que ce point est ouvert : c'est le maillon qui
conditionne les critères 3, 4, 8 et 9.

Bonne nouvelle sur l'effort : `src/lib/payments.js:47` expose déjà un **registre de providers**
(`registerProvider(name, impl)` avec l'interface `{ initiate(txn), handleWebhook(request) }`),
et `TODO.md:168` confirme que l'abstraction « permettra [Mvola/Orange/Airtel] sans changement
de la couche solde/examen ». Brancher un agrégateur mobile money est donc une **extension
contenue, pas une réécriture**.
→ **Q19** du sondage dit quel rail activer en priorité.

### E · Renforcer la RÉSISTANCE (5 → 7) — créer du retour sans trahir l'éphémère

L'éphémère protège la vie privée mais empêche tout verrou. Piste réconciliatrice : garder les
**salles** éphémères côté élèves, mais offrir au formateur un **carnet de notes / historique de
classe persistant** — déjà partiellement présent via `/host/classes` et `/host/history`. C'est
*son* actif accumulé qui le retient, sans stocker de données élèves brutes.
Le `[Suivi historique = évolution future ?]` du brief devient ainsi un **axe de rétention**,
pas une simple feature.

---

## Bouclage avec le sondage

Chaque critère faible est instrumenté par au moins une question de
[`sondage-validation-besoin.md`](./sondage-validation-besoin.md) :

| Critère évalué | Questions du sondage |
|---|---|
| **Urgence** (1) | Q7 temps de correction · **Q8 pic de charge** · Q10 verbatim frustration · Q13 adéquation |
| **Taille du marché** (2) | Q2 géographie · Q3 taille de session · Q4 fréquence |
| **Prix possible** (3) | Q17 intention d'achat · Q18-Q19 corridor de prix · **Q22 offre établissement** |
| **Coût d'acquisition** (4) | Q11 canal de découverte · Q21 recommandation |
| **Originalité** (6) | Q5 outils actuels · Q14 fonctionnalités utiles · Q15 avantage perçu |
| **Vente additionnelle** (9) | Q3 taille de session (palier illimité) · Q22 |
| **Résistance** (10) | Q4 récurrence · Q16 freins |
| **Paiement** (D) | **Q20 rail de paiement** |

**Après dépouillement** : re-scorer cette grille avec les données réelles, remonter les
conclusions dans [`product-marketing.md`](./product-marketing.md), et arbitrer les priorités
A→E en conséquence.

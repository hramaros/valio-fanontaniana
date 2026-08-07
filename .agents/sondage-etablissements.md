# Sondage établissements — projet valio

*Instrument de découverte B2B — à copier-coller dans Google Forms.*
*Créé le 2026-08-06.*
*Cible : responsables pédagogiques, directions d'établissement, cabinets et organismes de
formation, responsables formation / RH.*

> **Sondage distinct de celui des formateurs.** Le questionnaire
> [`sondage-validation-besoin.md`](./sondage-validation-besoin.md) s'adresse à l'**utilisateur**
> (celui qui corrige). Celui-ci s'adresse à un **acheteur qui n'est pas l'utilisateur** : il ne
> corrige pas de copies, il arbitre un budget. Les mélanger produirait une bouillie
> inexploitable — leurs douleurs, leur vocabulaire et leurs critères n'ont rien de commun.

## Ce que ce sondage doit trancher

L'« offre établissement » est aujourd'hui le **levier de revenu n°1** de
[`evaluation-marche.md`](./evaluation-marche.md) : c'est la voie la plus rapide pour desserrer
le plafond de prix (3/10, la note la plus basse). Elle est aussi **entièrement hypothétique** —
`src/lib/accounts.js` n'a ni organisation, ni siège, ni solde partagé. La construire coûterait
un vrai chantier de modèle de données.

**Ce sondage doit donc pouvoir la tuer avant qu'on ne la construise.**

| Question à trancher | Comment | Questions |
|---|---|---|
| **Le besoin existe-t-il à l'échelle de l'établissement ?** | Incidents réels vécus, pas opinions | Q7-Q12 |
| **Y a-t-il un budget, et qui décide ?** | Achat récent réel, cycle, pouvoir de signature | Q13-Q17 |
| **L'établissement veut-il porter ce sujet ?** | Ou le laisse-t-il à chaque enseignant | Q20 |
| **Quelle forme d'offre ?** | Unité de facturation, montant, contraintes admin | Q22-Q27 |
| **Est-ce vraiment notre marché ?** | Détection de l'anti-persona (ils veulent un LMS) | Q21 |

## Le piège à éviter absolument

`product-marketing.md` définit un **anti-persona** explicite : « établissement qui veut une LMS
complète (banque de questions partagée, suivi longitudinal, SSO, intégration des notes
officielles) ». Or c'est exactement ce qu'un directeur d'établissement risque de demander.

La **Q21** est construite pour détecter cela : elle liste des besoins de *gestion scolaire*
(bulletins, emploi du temps, absences, communication aux familles) à côté des besoins
d'évaluation. Si les réponses se concentrent sur la gestion scolaire, la conclusion n'est pas
« il faut construire tout ça » — c'est **« ce segment n'est pas notre marché »**, et le levier
n°1 tombe. Mieux vaut l'apprendre par un formulaire que par six mois de développement.

## Avertissement de méthode

En B2B, **le volume ne veut rien dire** : huit établissements qui répondent sérieusement valent
mieux que cinquante réponses tièdes. Et à ce stade, un rendez-vous de trente minutes avec un
responsable pédagogique vaut mieux que son formulaire — la Q30 est là pour ça.

**Qualifier le répondant est essentiel.** Un enseignant qui répond « à la place » de sa
direction produit une donnée fausse : la Q6 mesure son pouvoir réel d'engager une dépense, et
l'analyse doit écarter ceux qui n'en ont aucun.

Durée : ~9 min. **26 questions obligatoires, 8 facultatives.**

## Formulaire nominatif — le coût est plus élevé ici

Ce sondage **n'est pas anonyme** : e-mail obligatoire (Q32), et le nom de la structure est
demandé (Q33). Il alimente aussi la **base de contacts**.

Ce choix coûte plus cher côté établissement que côté formateur, parce que les questions qui
comptent portent sur des sujets qu'on n'expose pas volontiers sous le nom de son école :

| Question | Ce qui se dégrade sous identité |
|---|---|
| Q10 « dernier incident » | Personne ne raconte une contestation de note au nom de son établissement |
| Q14 budget annuel | Le budget est une information stratégique — la non-réponse va augmenter |
| Q17 « un achat a-t-il échoué ? » | Revient à documenter un échec interne, signé |
| Q8 « règle commune peu appliquée » | Aveu d'un défaut d'organisation |

**Compensations retenues :**

1. Ces quatre questions restent **facultatives**, et l'option « je préfère ne pas répondre »
   existe sur la Q14.
2. Le formulaire annonce d'emblée que **rien n'est publié ni transmis**, et qu'aucun nom
   d'établissement ne sera cité — c'est la condition minimale pour obtenir la Q10.
3. Le **consentement marketing est séparé** (Q34) de la réponse et de l'accord d'entretien.
4. À l'analyse : **la non-réponse à la Q14 est elle-même une donnée.** Un taux élevé de
   « préfère ne pas répondre » indique une réticence à parler budget, pas une absence de
   budget — ne pas confondre les deux.

> **Contrepartie à honorer.** Sur ce segment, la relance nominative *est* l'intérêt du
> nominatif : un responsable qui a répondu et qu'on rappelle deux semaines plus tard avec une
> proposition de pilote, c'est le cycle de vente réel. Encore faut-il rappeler.

---

## Le formulaire

**Titre** : Les évaluations dans votre établissement

**Description (haut de formulaire)** :
> Nous concevons un outil d'évaluation pour les établissements et organismes de formation, et
> **rien n'est encore construit** — vos réponses orienteront ce que nous ferons, ou nous
> feront renoncer.
>
> Comptez **9 minutes**. Il n'y a pas de bonne réponse : décrivez ce qui se passe réellement
> chez vous.
>
> **Ce que nous vous demandons et pourquoi.** Nous vous demandons votre e-mail et le nom de
> votre structure afin de pouvoir vous recontacter, vous proposer un essai et vous dire ce que
> vos réponses ont changé. **Rien n'est publié, rien n'est transmis à un tiers, et aucun nom
> d'établissement ne sera cité nulle part.** Les questions sensibles — incidents, budget — sont
> facultatives : laissez-les vides si vous préférez, c'est plus utile qu'une réponse
> approximative.

---

### Section 1 — Votre structure

**Q1. De quel type de structure s'agit-il ?** *(choix unique — obligatoire)*
- École / collège / lycée **public**
- École / collège / lycée **privé**
- Université ou établissement supérieur
- Centre ou organisme de formation professionnelle
- Service formation d'une entreprise
- Autre…
> *Segmentation décisive : la capacité à payer d'un lycée public et d'un organisme privé n'ont
> rien à voir. Ne jamais moyenner les réponses entre ces types.*

**Q2. Où êtes-vous situé ?** *(choix unique — obligatoire)*
- Madagascar *(préciser la ville…)*
- Autre pays francophone *(préciser…)*

**Q3. Combien d'enseignants ou de formateurs interviennent chez vous ?** *(choix unique — obligatoire)*
- 1 à 5 · 6 à 15 · 16 à 40 · Plus de 40

**Q4. Combien d'apprenants au total ?** *(choix unique — obligatoire)*
- Moins de 50 · 50 à 200 · 200 à 500 · Plus de 500

**Q5. Quel est votre rôle ?** *(choix unique — obligatoire)*
- Direction / chef d'établissement
- Responsable pédagogique
- Responsable formation / RH
- Responsable administratif ou financier
- Enseignant / formateur *(sans fonction de direction)*
- Autre…

**Q6. Pourriez-vous décider seul·e d'une dépense de 200 000 Ar pour un outil pédagogique ?**
*(choix unique — obligatoire)*
- Oui, je décide seul·e
- Je peux le proposer, quelqu'un d'autre valide
- Non, ce n'est pas de mon ressort
- Il n'y a pas de budget pour ce type de dépense
> *Qualification du répondant. Sans ce filtre, on risque d'analyser les envies de gens qui
> n'ont aucun pouvoir d'achat — l'erreur classique du sondage B2B.*

---

### Section 2 — Les évaluations chez vous aujourd'hui

**Q7. Savez-vous quels outils vos enseignants utilisent pour évaluer ?** *(choix unique — obligatoire)*
- Oui, précisément
- En gros, sans détail
- Non, chacun fait comme il veut
> *Question révélatrice : si la direction ne sait pas, c'est que le sujet n'est pas piloté à
> son niveau — et donc probablement pas acheté à son niveau non plus.*

**Q8. Existe-t-il chez vous une règle commune sur la façon d'évaluer ou de noter ?**
*(choix unique — obligatoire)*
- Oui, écrite et appliquée · Oui, mais peu appliquée · Non, chaque enseignant fait à sa façon
- Je ne sais pas

**Q9. Comment les notes remontent-elles jusqu'aux bulletins ?** *(choix unique — obligatoire)*
- Saisie manuelle par chaque enseignant dans un tableur
- Saisie manuelle par l'administration
- Un logiciel s'en charge
- Sur papier
- Autre…

**Q10. Racontez le dernier incident lié aux évaluations que vous avez eu à gérer.**
*(réponse longue — facultatif)*
> *Exemples à donner en aide de saisie : contestation d'une note par une famille, copies
> perdues, bulletins en retard, soupçon de triche, écarts de niveau entre deux classes.
> **C'est ici que se trouve le vocabulaire du décideur** — il ne parlera pas de « correction
> chronophage » mais de réclamation, de retard, de fiabilité.*

**Q11. Sur le sujet des évaluations, qu'est-ce qui vous préoccupe le plus, en tant que
responsable ?** *(réponse longue — obligatoire)*
> *Question ouverte non suggérée. Si les réponses ne parlent que de pédagogie et jamais
> d'organisation, de traçabilité ou de coût, l'établissement n'est pas un acheteur pour ce
> problème.*

**Q12. Vous arrive-t-il de devoir prouver ou retrouver le résultat d'une évaluation passée ?**
*(choix unique — obligatoire)*
- Oui, régulièrement · Oui, occasionnellement · Non, jamais
> *Teste la valeur de la fiche de résultats vérifiable — une fonctionnalité qui existe déjà
> (`/verifier`) et n'a jamais été vendue à ce public.*

---

### Section 3 — Ce que vous achetez déjà

> *La section la plus prédictive. Ce qu'une structure achète déjà dit infiniment plus que ce
> qu'elle déclare vouloir.*

**Q13. Payez-vous aujourd'hui pour des outils numériques pédagogiques ou administratifs ?**
*(choix multiple — obligatoire)*
- Logiciel de gestion scolaire / notes
- Outils bureautiques (Microsoft, Google Workspace…)
- Plateforme de cours en ligne
- Outils de quiz ou d'évaluation
- Connexion internet dédiée
- Rien de tout cela
- Autre…

**Q14. Quel budget annuel consacrez-vous à ces outils, approximativement ?**
*(choix unique — obligatoire)*
- Aucun · Moins de 500 000 Ar · 500 000 à 2 000 000 Ar · 2 à 10 millions Ar
- Plus de 10 millions Ar · Je préfère ne pas répondre

**Q15. Racontez votre dernière acquisition d'outil numérique** — comment la décision a été
prise, combien de temps ça a pris, qui a validé. *(réponse longue — facultatif)*
> *L'équivalent B2B du « racontez votre dernière évaluation ». On y lit le cycle de décision
> réel, pas celui que l'organigramme suggère.*

**Q16. À quel moment de l'année les décisions d'achat se prennent-elles ?**
*(choix unique — obligatoire)*
- En début d'année scolaire · En fin d'année scolaire · À tout moment selon le besoin
- Il n'y a pas de cycle défini · Je ne sais pas
> *Détermine la fenêtre commerciale. Arriver hors cycle budgétaire, c'est perdre l'année.*

**Q17. Un achat de ce type a-t-il déjà échoué ou été abandonné chez vous ? Pourquoi ?**
*(réponse longue — facultatif)*
> *Les objections réelles se trouvent ici, pas dans une liste de cases à cocher.*

---

### Section 4 — Un projet en cours de conception

> **Aucune capture d'écran.** Le concept est décrit en mots et au conditionnel. Il décrit
> délibérément une **vue établissement qui n'existe pas** dans le produit actuel : c'est
> l'hypothèse à tester, pas une fonctionnalité livrée. Ne jamais la présenter comme
> disponible.

**Texte à coller au-dessus de Q18** :
> Voici ce que nous envisageons — **rien n'est construit, tout peut changer** :
>
> Vos enseignants prépareraient leurs évaluations et les feraient passer en classe : les
> apprenants répondent depuis leur téléphone avec un **code, sans créer de compte**. Chaque
> évaluation produirait automatiquement **une note sur 20** et une **fiche de résultats
> archivée**, consultable via un code — y compris par une famille qui conteste une note.
> L'établissement disposerait d'une vue d'ensemble des évaluations menées.

**Q18. Votre première réaction, spontanément ?** *(réponse longue — obligatoire)*

**Q19. Qu'est-ce qui manquerait pour que ce soit adoptable dans votre structure ?**
*(réponse longue — facultatif)*

**Q20. Est-ce un sujet que votre structure porterait, ou que vous laisseriez à chaque
enseignant ?** *(choix unique — obligatoire)*
- La structure le porterait et le financerait
- La structure le recommanderait, mais chaque enseignant se débrouillerait
- Ce serait au libre choix de chacun, sans implication de la structure
- Nous ne toucherions pas à ce sujet
> ⚠️ **La question qui décide de tout.** Si la majorité répond autre chose que la première
> option, il n'y a pas d'offre établissement à construire — quelles que soient les réponses
> par ailleurs enthousiastes.

**Q21. Parmi ces besoins, lesquels sont réellement prioritaires pour vous ?**
*(choix multiple — obligatoire)*
- Des évaluations plus rapides à corriger pour les enseignants
- Des notes fiables et traçables
- Pouvoir justifier une note auprès d'une famille
- L'harmonisation des évaluations entre classes ou entre enseignants
- Des statistiques par classe, par niveau ou par enseignant
- **La gestion des bulletins scolaires**
- **La gestion des emplois du temps**
- **Le suivi des absences**
- **La communication avec les familles**
- Une banque de sujets partagée entre enseignants
- L'archivage réglementaire des évaluations
- Aucun de ces sujets n'est prioritaire
- Autre…

> ⚠️ **Test de l'anti-persona.** Les quatre items en gras relèvent d'un **logiciel de gestion
> scolaire**, pas d'un outil d'évaluation. S'ils dominent, ce segment attend un produit que
> valio n'a aucune intention de construire : la bonne conclusion est de **renoncer au segment**,
> pas d'élargir le périmètre.

---

### Section 5 — Ce que ça vaudrait

**Q22. Sur quelle base une facturation vous paraîtrait-elle logique ?**
*(choix unique — obligatoire)*
- Par enseignant et par an
- Par apprenant et par an
- Un forfait pour tout l'établissement
- À l'usage, selon le nombre d'évaluations
- Nous ne paierions pas pour ce type d'outil
- Autre…
> *Valide la **forme** de l'offre avant son montant. Le produit actuel ne sait facturer qu'à
> l'usage, sur un compte individuel : toute autre réponse majoritaire implique de construire
> un modèle d'organisation.*

**Q23. Quel budget annuel vous paraîtrait réaliste pour un tel outil ?** *(réponse courte — facultatif)*
> *Champ libre, sans montant suggéré ni unité imposée — comme pour les formateurs, l'unité
> qu'ils choisissent spontanément est déjà une information.*

**Texte à coller au-dessus de Q24** :
> À titre indicatif, nous envisageons un ordre de grandeur d'environ **20 000 Ar par
> enseignant et par an**, sans engagement de durée.

**Q24. Qu'en pensez-vous ?** *(choix unique — obligatoire)*
- Trop cher · Un peu cher · Juste · Bon marché · Je ne sais pas

**Q25. Pourquoi ?** *(réponse courte — facultatif)*

**Q26. De quoi auriez-vous besoin pour pouvoir payer ?** *(choix multiple — obligatoire)*
- Un devis
- Une facture en bonne et due forme
- Un contrat ou une convention
- Un paiement par virement bancaire
- Un paiement par mobile money
- Un paiement en espèces
- Une période d'essai gratuite
- Autre…
> *Contraintes administratives réelles. Une structure ne peut souvent pas payer un outil
> incapable d'émettre une facture — c'est un bloqueur opérationnel, pas une préférence, et il
> concerne directement le rail de paiement encore à construire.*

**Q27. Accepteriez-vous un essai gratuit avec une classe ou un groupe ?** *(choix unique — obligatoire)*
- Oui, volontiers · Peut-être · Non
> *La porte d'entrée réaliste sur ce segment : un pilote, pas un contrat.*

---

### Section 6 — À vous

**Q28. Qu'aurions-nous dû vous demander et que nous n'avons pas demandé ?**
*(réponse longue — facultatif)*

**Q29. Autre chose à ajouter ?** *(réponse longue — facultatif)*

**Q30. Accepteriez-vous un échange de 30 minutes ?** *(choix unique — obligatoire)*
- Oui · Peut-être · Non
> *Le meilleur rendement du formulaire sur ce segment.*

**Q31. Votre nom et votre fonction** *(réponse courte — obligatoire)*
> *Contrairement au sondage formateurs, le nom est ici **obligatoire** : en B2B, on ne
> recontacte pas une adresse, on rappelle une personne identifiée dans une organisation.*

**Q32. Votre e-mail** *(réponse courte — **obligatoire**, validation « adresse e-mail »)*

**Q33. Le nom de votre structure** *(réponse courte — obligatoire)*
> *Permet de dédoublonner (plusieurs réponses d'un même établissement), de rapprocher un
> décideur de ses enseignants s'ils ont répondu à l'autre sondage, et de préparer une
> proposition de pilote ciblée. **Ne jamais le citer ailleurs** — c'est la promesse faite en
> tête de formulaire.*

**Q34. Souhaitez-vous recevoir nos actualités (avancement du projet, ouverture des essais) ?**
*(choix unique — obligatoire)*
- Oui
- Non, contactez-moi uniquement au sujet de ce questionnaire
> ⚠️ **Consentement séparé, non pré-coché**, et distinct de l'accord d'entretien (Q30). Trois
> consentements différents : répondre, être rappelé pour un entretien, recevoir des actualités.
> Les confondre rendrait la base inexploitable dans la durée.

---

## Réglages Google Forms

- **6 sections** natives.
- **Aucune capture d'écran**, en particulier en Section 4 — le concept doit rester discutable,
  et la « vue établissement » qu'il décrit n'existe pas.
- **Obligatoires (26)** : Q1-Q9, Q11-Q14, Q16, Q18, Q20-Q22, Q24, Q26, Q27, Q30-Q34.
- **Aucun branchement sur les Q31-Q33** : identité, e-mail et structure sont demandés à tous,
  y compris à ceux qui refusent l'entretien (Q30) ou les actualités (Q34).
- Activer la **validation « adresse e-mail »** sur la Q32.
- Laisser les Q10, Q14, Q17 **facultatives** : ce sont les questions que l'identité fragilise
  (voir plus haut). Les rendre obligatoires ferait fuir les réponses, pas apparaître la vérité.
- Barre de progression activée.

---

## Comment dépouiller

**Segmenter avant de compter — impérativement par Q1** (public / privé / organisme /
entreprise). Un lycée public sans budget et un organisme de formation privé n'ont ni les mêmes
douleurs ni les mêmes moyens ; les moyenner produirait une conclusion vraie pour personne.

**Écarter les répondants sans pouvoir de décision** (Q6 = « pas de mon ressort ») de toute
conclusion sur le budget et l'offre. Leurs réponses restent utiles sur les Sections 2 et 4,
pas sur la Section 5.

**Seuil B2B : 5 structures par type minimum.** En dessous, on lit des anecdotes. Et sur ce
segment, une anecdote détaillée issue d'un entretien vaut mieux qu'une moyenne sur trois
réponses.

Pour les champs libres (Q10, Q11, Q15, Q17, Q19, Q28), appliquer le même protocole de codage
que le sondage formateurs : thèmes, fréquence × intensité, verbatims mot pour mot, et un
niveau de confiance (élevée : 3+ structures indépendantes / moyenne : 2 / faible : 1).

---

## Grille de décision

### L'offre établissement mérite-t-elle d'être construite ?

| Signal | Question | Seuil |
|---|---|---|
| **La structure veut porter le sujet** | **Q20 = « la structure le porterait et le financerait »** | **≥ 50 %** |
| Un besoin institutionnel existe | Q11 mentionne traçabilité, harmonisation, réclamations ou coût | ≥ 50 % |
| Un budget existe | Q14 ≠ « aucun » | ≥ 60 % |
| Le répondant peut engager la dépense | Q6 = décide seul ou peut proposer | ≥ 60 % |
| Le prix passe | Q24 = juste ou bon marché | ≥ 50 % |
| Une forme d'offre se dégage | Q22, une modalité dominante | ≥ 50 % |
| Une porte d'entrée existe | Q27 = oui | ≥ 40 % |

**Verdict** : construire le modèle d'organisation (comptes multi-enseignants, solde partagé,
rôles) **uniquement si Q20, le budget et le prix passent ensemble**. C'est un chantier lourd ;
il ne se lance pas sur un signal partiel.

### Signaux d'abandon du segment

| Signal | Lecture |
|---|---|
| **Q21** dominé par bulletins / emploi du temps / absences / communication familles | Ils veulent un **logiciel de gestion scolaire**. C'est l'anti-persona documenté → **renoncer au segment**, ne pas élargir le périmètre |
| **Q20** majoritairement « au libre choix de chacun » | Il n'y a pas d'acheteur institutionnel → **rester sur l'offre individuelle** et retirer l'offre établissement de la feuille de route |
| **Q14** = « aucun budget » majoritaire | Segment insolvable sur ce type de structure → **le restreindre au privé / aux organismes** |
| **Q7** = « je ne sais pas ce qu'ils utilisent » majoritaire | Le sujet n'est pas piloté à ce niveau → l'achat ne s'y décidera pas non plus |
| **Q26** exige devis + facture + contrat, majoritairement | Bloqueur **opérationnel** : sans structure juridique capable de facturer, le segment est inaccessible quel que soit l'appétit — à trancher avant tout développement |

---

## Après collecte

1. Trancher l'hypothèse « offre établissement » de
   [`product-marketing.md`](./product-marketing.md) — la confirmer, la restreindre à un type de
   structure, ou **la retirer** de la feuille de route.
2. Re-scorer les critères **taille de marché**, **prix possible** et **vente additionnelle** de
   [`evaluation-marche.md`](./evaluation-marche.md) : ce sont les trois que cette offre était
   censée redresser.
3. Si elle est confirmée : la page `/etablissements` de
   [`site-vitrine.md`](./site-vitrine.md) peut être écrite, et le modèle d'organisation
   spécifié (`src/lib/accounts.js` n'a aujourd'hui ni équipe, ni rôle partagé, ni solde commun).
4. Reporter les contraintes de la Q26 dans les exigences du rail de paiement (facturation,
   virement) — elles diffèrent de celles des formateurs individuels.
5. **Appeler les structures de la Q30.** Sur ce segment, l'entretien n'est pas un complément :
   c'est la méthode principale.

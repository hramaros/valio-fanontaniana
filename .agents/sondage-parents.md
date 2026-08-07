# Sondage parents — projet valio

*Instrument de découverte — à copier-coller dans Google Forms.*
*Créé le 2026-08-07.*
*Cible : parents et tuteurs d'apprenants (Madagascar d'abord).*

> **Troisième public, troisième questionnaire.**
> [`sondage-validation-besoin.md`](./sondage-validation-besoin.md) → le **formateur**
> (utilisateur et payeur). [`sondage-etablissements.md`](./sondage-etablissements.md) →
> l'**établissement** (acheteur). Celui-ci → le **parent**, qui n'est aujourd'hui ni l'un ni
> l'autre.

## À quoi sert ce sondage — et ce qu'il ne faut pas en attendre

Soyons clairs sur le statut de ce public : **le parent n'est pas un client.** Il n'utilise pas
l'outil, ne l'achète pas, et rien dans le produit ne le monétise. `PRODUCT.md` lui donne un
seul rôle : *vérificateur* — muni d'un code `VF-XXXX-XXXX`, il consulte la fiche publique des
résultats sur `/verifier`, sans compte.

Ce sondage n'est donc **pas** un test de marché. Il sert quatre choses beaucoup plus précises :

| Objectif | Pourquoi ça compte | Questions |
|---|---|---|
| **Valider la fiche vérifiable** | Fonctionnalité **déjà construite** et jamais confrontée à son public | Q11-Q17 |
| **Mesurer le risque « données de l'enfant »** | Un rejet ici est un **risque produit**, pas un détail | Q18-Q20 |
| **Tester la prescription vers l'école** | Un parent qui réclame l'outil est un canal d'acquisition gratuit | Q21-Q22 |
| **Tester l'hypothèse famille-payeuse** | Elle figure dans le sondage formateurs (Q33) sans avoir jamais été testée côté familles | Q23-Q24 |

**Ce qu'il ne faut pas en attendre :** une justification pour construire un espace parent, une
application famille, ou un abonnement aux familles. Si l'envie apparaît à la lecture des
réponses, relire d'abord la section « signaux d'abandon » plus bas.

## Le risque que ce sondage doit surtout révéler

La fiche de résultats est accessible **à quiconque détient le code**. C'est un choix de
conception assumé (aucun compte, aucune friction) mais il a une conséquence : un code qui
circule expose la note d'un élève à qui le reçoit.

Personne n'a jamais demandé aux parents ce qu'ils en pensent. **Les Q18-Q20 sont là pour ça**,
et une réponse majoritairement négative doit changer le produit — pas être écartée parce
qu'elle dérange. C'est le seul endroit de tout le dispositif de recherche où l'on teste une
décision technique déjà prise contre les gens qu'elle concerne.

## Avertissement de méthode

Les parents répondent volontiers et **sur-déclarent l'implication** : « oui, je consulterais
chaque note » est une réponse presque gratuite à donner. Pondérer en conséquence, et donner
plus de poids aux Q7-Q10 (ce qu'ils font *déjà*) qu'aux Q13-Q15 (ce qu'ils feraient).

Biais de recrutement à surveiller : diffusé via une école, ce questionnaire atteindra
surtout les parents **déjà les plus impliqués**. Ils ne représentent pas l'ensemble des
familles — l'écrire noir sur blanc dans toute conclusion.

Durée : **~6 min**. Volontairement plus court que les deux autres : ce n'est pas un public
professionnel, et il ne remplit pas ce formulaire dans le cadre de son travail.
**20 questions obligatoires, 7 facultatives.**

## Une seule donnée collectée : l'e-mail

Ce sondage **n'est pas anonyme** : l'e-mail est demandé (Q26) pour pouvoir recontacter les
répondants. **C'est la seule donnée personnelle collectée.**

**Ne jamais demander le nom de l'enfant, sa classe précise ni celui de son école.** Cela
n'apporterait rien à l'analyse et créerait une donnée sensible à protéger — sur un
questionnaire qui interroge justement les familles sur la protection des données de leurs
enfants. L'e-mail du parent suffit à recontacter.

La Q10 (avoir contesté une note) touche à une relation avec un établissement identifiable :
elle reste facultative.

---

## Le formulaire

**Titre** : Comment suivez-vous la scolarité de votre enfant ?

**Description (haut de formulaire)** :
> Nous concevons un outil d'évaluation destiné aux enseignants, et nous voulons savoir ce que
> les familles en attendraient — **rien n'est encore décidé**.
>
> Comptez **6 minutes**. Nous vous demandons **uniquement votre e-mail**, pour vous tenir
> informé·e et vous dire ce que vos réponses ont changé. **Nous ne demandons ni votre nom, ni
> celui de votre enfant, ni celui de son école.** Rien n'est publié ni transmis à un tiers.

---

### Section 1 — Vous

**Q1. Combien d'enfants avez-vous en cours de scolarité ?** *(choix unique — obligatoire)*
- 1 · 2 · 3 · 4 ou plus

**Q2. En quelle classe est le plus concerné ?** *(choix unique — obligatoire)*
- Primaire · Collège · Lycée · Supérieur · Formation professionnelle

**Q3. Dans quel type d'établissement ?** *(choix unique — obligatoire)*
- Public · Privé · Je ne sais pas / autre

**Q4. Où habitez-vous ?** *(choix unique — obligatoire)*
- Madagascar *(préciser la ville…)* · Autre pays francophone *(préciser…)*

**Q5. Avec quoi consultez-vous internet le plus souvent ?** *(choix unique — obligatoire)*
- Smartphone · Ordinateur · Je n'ai pas d'accès internet régulier · Autre…
> *Détermine si une fiche consultable en ligne est même atteignable pour ce public. Une
> réponse « pas d'accès régulier » majoritaire invalide tout le reste de la section 3.*

---

### Section 2 — Comment vous suivez la scolarité aujourd'hui

> *La section la plus fiable du questionnaire : elle porte sur des faits, pas sur des
> intentions.*

**Q6. Comment savez-vous si votre enfant réussit ?** *(choix multiple — obligatoire)*
- Le bulletin en fin de trimestre
- Un carnet de notes ou de correspondance
- Mon enfant me le dit
- Je vois ses copies corrigées
- Un groupe WhatsApp / Facebook de la classe
- Une application ou un site de l'établissement
- Je n'ai pas vraiment d'information
- Autre…

**Q7. À quelle fréquence avez-vous une information sur ses résultats ?** *(choix unique — obligatoire)*
- Après chaque évaluation · Une fois par mois environ · Une fois par trimestre
- Une ou deux fois par an · Presque jamais

**Q8. Cette fréquence vous convient-elle ?** *(choix unique — obligatoire)*
- Oui, c'est suffisant · J'aimerais être informé·e plus souvent · Je préférerais moins
- Je ne sais pas

**Q9. Vous est-il déjà arrivé d'être surpris·e par une note ou un bulletin ?**
*(choix unique — obligatoire)*
- Oui, plusieurs fois · Oui, une fois · Non, jamais
> *Le déclencheur concret. Une surprise désagréable en fin de trimestre est le moment où un
> parent voudrait avoir su plus tôt — c'est là que se situe le besoin, s'il existe.*

**Q10. Avez-vous déjà voulu comprendre ou contester une note ? Racontez ce qui s'est passé.**
*(réponse longue — facultatif)*
> *Récolte du vocabulaire des familles. Une fiche « vérifiable » ne vaut que s'il existe des
> situations où quelqu'un a besoin de vérifier — cette question dit si elles existent.*

---

### Section 3 — Une idée en cours de réflexion

> **Aucune capture d'écran.** Décrit en mots, au conditionnel.

**Texte à coller au-dessus de Q11** :
> Voici ce que nous envisageons — **rien n'est décidé** :
>
> Après une évaluation, l'enseignant vous transmettrait un **code**. En le saisissant sur une
> page web, vous verriez la **fiche officielle des résultats** : la note de votre enfant, le
> détail des réponses, la moyenne de la classe. **Sans créer de compte et sans installer
> d'application.**

**Q11. Votre première réaction, spontanément ?** *(réponse longue — obligatoire)*

**Q12. Est-ce que cela répondrait à un besoin que vous avez ?** *(choix unique — obligatoire)*
- Oui, tout à fait · Plutôt oui · Plutôt non · Non, pas du tout · Je ne sais pas

**Q13. À quelle fréquence pensez-vous que vous le consulteriez ?** *(choix unique — obligatoire)*
- À chaque évaluation · De temps en temps · Seulement en cas de problème · Jamais
> *À pondérer : l'intention déclarée est ici systématiquement supérieure à l'usage réel.*

**Q14. Qu'est-ce qui vous gênerait ou vous manquerait ?** *(réponse longue — facultatif)*

**Q15. Préféreriez-vous recevoir l'information autrement ?** *(choix unique — obligatoire)*
- Par SMS · Par WhatsApp · Par e-mail · Sur papier, comme aujourd'hui
- Sur une page à consulter moi-même · Peu importe
> *Question qui peut invalider tout le concept : si les familles veulent un SMS, une page web à
> consulter n'est pas le bon support, quel que soit son intérêt.*

**Q16. Vous et votre enfant parlez-vous de ses résultats ?** *(choix unique — obligatoire)*
- Oui, ouvertement · Parfois · Rarement · Non
> *Contexte indispensable pour lire la Q19 : dans une famille où l'on n'en parle pas, une fiche
> consultable par le parent change une relation, pas seulement un canal d'information.*

**Q17. À votre avis, comment votre enfant réagirait-il ?** *(choix unique — facultatif)*
- Cela ne le dérangerait pas · Cela le mettrait mal à l'aise · Il y serait opposé
- Je ne sais pas

---

### Section 4 — Les données de votre enfant

> *Section la plus importante du questionnaire. Elle teste une décision de conception **déjà
> prise** : la fiche est accessible à quiconque possède le code.*

**Q18. Que les résultats de votre enfant soient consultables en ligne, cela vous…**
*(choix unique — obligatoire)*
- Ne pose aucun problème
- Pose un problème seulement si d'autres personnes peuvent les voir
- Pose problème dans tous les cas
- Je ne sais pas

**Texte à coller au-dessus de Q19** :
> Précision importante : dans ce que nous envisageons, **toute personne connaissant le code
> pourrait consulter la fiche** — le code n'est pas protégé par un mot de passe.

**Q19. Sachant cela, qu'en pensez-vous ?** *(choix unique — obligatoire)*
- Cela me convient, le code ne circulera pas
- Cela me gêne, je voudrais une protection supplémentaire
- C'est rédhibitoire, je n'utiliserais pas
- Je ne sais pas
> ⚠️ **La question la plus importante du formulaire.** Une majorité sur les deux réponses du
> milieu ou du bas impose de revoir `/verifier` — code à durée limitée, accès nominatif, ou
> vérification d'identité. Ce serait un **résultat produit**, pas un avis à écarter.

**Q20. Pourquoi ?** *(réponse longue — facultatif)*

---

### Section 5 — Votre rôle

**Q21. Demanderiez-vous à l'école d'utiliser ce genre d'outil ?** *(choix unique — obligatoire)*
- Oui, spontanément · Peut-être, si l'occasion se présentait · Non
> *Teste le levier de prescription : un parent qui réclame l'outil auprès de l'école est un
> canal d'acquisition gratuit vers le segment établissement.*

**Q22. Cela changerait-il votre confiance envers l'établissement ?** *(choix unique — obligatoire)*
- Oui, en mieux · Non, sans effet · Oui, en moins bien · Je ne sais pas
> *Argument de vente potentiel **auprès des établissements** — c'est eux que cette réponse
> intéresse, pas les familles.*

**Q23. Si l'école ne le finançait pas, seriez-vous prêt·e à payer pour y accéder ?**
*(choix unique — obligatoire)*
- Oui · Peut-être, selon le prix · Non · Non, cela devrait être fourni par l'école
> *Teste l'hypothèse « les familles paient », présente dans le sondage formateurs (Q33) et
> jamais confrontée aux familles elles-mêmes. **Attendre un « non » massif** — auquel cas
> l'option doit disparaître de toute réflexion sur le modèle économique.*

**Q24. Si oui, quel montant vous paraîtrait acceptable ?** *(réponse courte — facultatif)*

---

### Section 6 — À vous

**Q25. Qu'aurions-nous dû vous demander et que nous n'avons pas demandé ?**
*(réponse longue — facultatif)*

**Q26. Votre e-mail** *(réponse courte — **obligatoire**, validation « adresse e-mail »)*
> *Intitulé à afficher tel quel : « Votre e-mail — pour vous tenir informé·e de la suite du
> projet. » Seule donnée personnelle demandée.*

**Q27. Accepteriez-vous un échange de 15 minutes ?** *(choix unique — facultatif)*
- Oui · Non

---

## Réglages Google Forms

- **6 sections** natives, formulaire court : la cible n'est pas captive.
- **Aucune capture d'écran.**
- **Ne jamais demander** le nom de l'enfant, sa classe précise ni son établissement.
- **Obligatoires (20)** : Q1-Q9, Q11-Q13, Q15, Q16, Q18, Q19, Q21-Q23, Q26.
- Activer la **validation « adresse e-mail »** sur la Q26.
- Diffusion recommandée : via des enseignants ou des groupes WhatsApp de parents. **Noter le
  canal de diffusion** — il conditionne l'interprétation (voir le biais de recrutement).

---

## Grille de décision

### La fiche vérifiable a-t-elle un public ?

| Signal | Question | Seuil |
|---|---|---|
| Les familles manquent d'information | Q8 = « plus souvent » | ≥ 40 % |
| Un déclencheur existe | Q9 = surpris au moins une fois | ≥ 50 % |
| Le concept répond à un besoin | Q12 = oui / plutôt oui | ≥ 50 % |
| Le support est le bon | Q15 = page à consulter **ou** peu importe | ≥ 40 % |
| Le public est atteignable | Q5 ≠ « pas d'accès régulier » | ≥ 70 % |

### Signaux qui doivent changer le produit

| Signal | Lecture |
|---|---|
| **Q19** : « me gêne » ou « rédhibitoire » majoritaire | **Revoir `/verifier`** : code expirant, accès nominatif, ou protection supplémentaire. Décision produit, pas préférence marketing |
| **Q15** dominé par SMS ou WhatsApp | Le bon support n'est pas une page web → repenser le canal de restitution |
| **Q5** : accès internet irrégulier majoritaire | La consultation en ligne exclut le public visé → l'idée ne tient pas dans ce contexte |
| **Q17** : l'enfant y serait opposé, en nombre | Sujet de consentement des apprenants — à traiter avant toute mise en avant auprès des familles |

### Signaux d'abandon de la piste « parents »

| Signal | Lecture |
|---|---|
| **Q12** majoritairement négatif | Les familles n'attendent pas ça → **ne rien construire** côté parent |
| **Q21** = « non » majoritaire | Pas de levier de prescription → les parents ne sont pas un canal d'acquisition |
| **Q23** = « non » massif *(attendu)* | **Retirer définitivement** l'option « les familles paient » du modèle économique |
| **Q22** = « sans effet » majoritaire | L'argument transparence ne se vend pas aux établissements → le retirer du discours |

---

## Après collecte

1. Si la Q19 est négative : **ouvrir un sujet produit sur `/verifier`** avant toute promotion
   de la fonctionnalité auprès des familles ou des établissements.
2. Reporter le verdict de la Q23 dans
   [`product-marketing.md`](./product-marketing.md) — l'option « les apprenants ou leurs
   familles » de la Q33 du sondage formateurs doit être tranchée, pas laissée en suspens.
3. Si la Q22 est positive : l'argument devient utilisable dans le
   [sondage établissements](./sondage-etablissements.md) et sur la page `/etablissements` de
   [`site-vitrine.md`](./site-vitrine.md).
4. Si la Q21 est positive : documenter le levier de prescription parent → école dans la
   section *How to Reach Them* de `product-marketing.md`.
5. Ne pas conclure sur les familles au-delà de ces quatre points. **Ce public n'est pas un
   marché ; c'est un révélateur de risques et un canal possible.**

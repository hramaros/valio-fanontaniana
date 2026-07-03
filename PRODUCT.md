# Product

## Register

product

## Users

- **Formateurs / enseignants** (Madagascar, francophone) : ils créent des quiz depuis un ordinateur, projettent la salle d'attente et les résultats sur vidéoprojecteur, corrigent les réponses libres, suivent les notes de leurs classes. Contexte : salle de classe ou de formation, souvent connexion modeste.
- **Participants / élèves** : ils rejoignent sur smartphone (souvent bas de gamme) avec un code + pseudo, sans compte. Contexte : téléphone en main, ambiance de jeu en direct, temps limité.

## Product Purpose

valio.fanontaniana est le quiz en direct « style Kahoot » **qui produit une vraie note /20 exploitable**. Deux modes : Libre (gratuit, QCM, ≤ 10 participants, sans compte) et Examen (payant en Ariary : réponses libres corrigées à la main, export PDF, historique, classes nominatives, carnet de notes). Succès = un formateur lance un examen en quelques minutes et ressort avec des notes fiables ; un élève joue sans aucune friction.

## Brand Personality

Énergique, crédible, chaleureux. **Double registre assumé** : côté participants (join, play, result), l'énergie d'un jeu télévisé — le quatuor de couleurs des réponses, le podium, le chrono vivant ; côté formateur (host/*), la sobriété d'un outil d'évaluation digne de confiance — la couleur en touches fonctionnelles, jamais en décor. La marque est malgache (« valio » = réponds, « fanontaniana » = question) et le vert du logo est son fil conducteur.

## Anti-references

- **SaaS corporate froid** : dashboards gris/bleus génériques, grilles de cartes identiques, froideur d'outil B2B.
- **App enfantine** : mascottes, arcs-en-ciel, typographies rondes infantilisantes — incompatible avec la note /20.
- **Clone de Kahoot** : violet Kahoot, codes visuels calqués — valio a sa propre identité.
- **Austérité administrative** : formulaire d'intranet scolaire des années 2010.

## Design Principles

1. **La couleur suit le rôle** — festif côté joueurs, fonctionnel côté formateur ; un même système, deux intensités.
2. **La projection est le premier écran** — code de salle, lobby et podium sont conçus pour être lus au fond d'une salle ; le fond vert nuit existe pour le vidéoprojecteur.
3. **La note est sérieuse, le jeu est joyeux** — l'énergie ne déborde jamais sur ce qui touche à l'évaluation (notes, correction, carnet).
4. **Zéro friction participant** — un code, un pseudo, et c'est parti ; chaque écran joueur a une seule action évidente.
5. **Léger par défaut** — CSS pur, polling, pas de dépendance décorative ; la performance sur mobile modeste fait partie du design.

## Accessibility & Inclusion

- WCAG AA : contraste ≥ 4.5:1 (texte), ≥ 3:1 (grands éléments) — audité, à maintenir sur tout nouveau jeu de couleurs.
- La couleur n'est jamais seule porteuse de sens : chaque tuile de réponse porte son propre texte (pas de glyphes de forme — signature Kahoot, voir anti-références).
- `prefers-reduced-motion` respecté partout (les spinners d'état restent animés).
- Cibles tactiles ≥ 44 px, modales avec Échap/role=dialog, erreurs en `role="alert"`.

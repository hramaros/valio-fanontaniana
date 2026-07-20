# Design System — valio.fanontaniana

## Theme

Sombre unique (« vert nuit »), pensé pour la projection en salle et les
smartphones en faible luminosité. Pas de mode clair. Deux intensités d'un même
système : **écrans participants** (join, play, result) = énergie game-show ;
**écrans formateur** (host/*) = outil d'évaluation sobre.

## Colors

Tokens dans `src/app/globals.css` (`:root`). Le vert d'accent est aligné sur le
logo (`public/logo.png` : bulle `#73d683`, wordmark `#167241`).

| Token | Valeur | Rôle |
|---|---|---|
| `--ink` | `#0f1a14` | Fond de page (vert nuit) |
| `--ink-2` | `#13241b` | Fond encaissé (panels, inputs) |
| `--surface` | `#172c20` | Cartes |
| `--surface-2` | `#1f3a2b` | Surfaces relevées (boutons neutres) |
| `--line` / `--line-strong` | blanc 10 % / 16 % | Bordures |
| `--text` | `#eafff3` | Texte principal |
| `--muted` | `#9fc7b0` | Texte secondaire (AA sur surfaces) |
| `--muted-2` | `#8aa99a` | Placeholders (AA) |
| `--accent` | `#31d35c` | Accent marque (vert logo) |
| `--accent-bright` | `#89ec9c` | Accent clair : liens forts, focus, chrono |
| `--c-coral` | `#ff5d73` | Quatuor réponse 1 (▲) ; aussi erreur/danger |
| `--c-sky` | `#38a8ff` | Quatuor réponse 2 (■) |
| `--c-amber` | `#ffc24b` | Quatuor réponse 3 (●) ; aussi or du podium |
| `--c-mint` | `#32d267` | Quatuor réponse 4 (◆) ; aussi succès |

Règles :
- Contraste AA vérifié à chaque changement (texte 4.5:1, grands éléments 3:1).
- Le quatuor est le langage « jeu » : il vit sur les écrans participants et les
  moments festifs (podium, tuiles) ; côté formateur il n'apparaît qu'en
  fonctionnel (validation, données).
- Texte sombre sur accents clairs : `#06140d`.

## Typography

- **Display** : Bricolage Grotesque (500–800) — `--font-display`. Titres,
  scores, code de salle (letter-spacing large `0.28–0.32em` pour les codes).
- **Body** : Inter — `--font-body`. Corps 16 px, `line-height: 1.5`.
- Titres : `line-height: 1.05`, `letter-spacing: -0.02em`, gras 700–800.
- Échelle observée : 0.72rem (eyebrow) · 0.8/0.82 (tiny) · 0.9 · 1 · 1.4 · 1.8–2 ·
  2.4–2.6 · clamp(2.4rem, 7vw, 4rem) (hero).

## Components

- **`.card`** : dégradé surface→ink-2, bordure `--line`, radius 18px, ombre
  portée profonde. **`.panel`** : version plate encaissée, radius 12px.
- **`.btn`** : radius 12px, poids 600 ; `--primary` = dégradé accent-bright→accent
  avec texte `#06140d` ; `--ghost` bordé ; `--danger` bordé coral ; `--icon`
  44×44 ; focus visible 3px `--accent-bright`.
- **`.answer-tile`** : signature du produit — grandes tuiles colorées (quatuor),
  texte auto-contrasté (`readableText`), sélection = anneau blanc + ✓.
  **Pas de glyphes de forme** (anti-référence : clone de Kahoot) — le texte de
  la réponse porte le sens, jamais la couleur seule.
- **`.pill`** : navigation secondaire en chips (min-height 40px).
- **`.ring`** : chrono conique (`--p` en %), passe coral sous 10 s.
- **`.seg`** : contrôle segmenté (aria-pressed → fond accent).
- **Podium** : 3 colonnes teintées or/sky/coral, médailles émoji décoratives.
- **Modales** : `Modal.jsx` (role=dialog, Échap, focus) sur backdrop noir 60 %.
- **Icônes** : SVG inline (`Icon.jsx`, style Lucide, trait 2px, ~37 noms).
  Jamais d'émoji structurel ; émojis autorisés en contenu décoratif
  (`aria-hidden`). L'icône remplace le texte explicatif partout où c'est
  possible (hints, empty-states, choice-cards, stats).
- **`.code-tiles` / `.code-tile`** : marquee du code de salle (lobby projeté) —
  chaque caractère sur une tuile du quatuor, texte sombre `#06140d` (≥6:1),
  `role="img"` + aria-label épelé.
- **`.qtrack`** : barre de progression des questions (participant), remplissage
  en `scaleX` (transform-only), décorative (le pill « Question x/y » porte
  l'info).
- **Cartes d'état** : `.card--ok` (mint), `.card--ko` (coral), `.card--wait`
  (accent), `.card--gold` (vainqueur) — bordure teintée + lavis 10–14 % en
  dégradé vers `--ink-2`.
- **`.money` / `.pill--money`** : sémantique argent — tout montant en Ariary
  prononcé s'affiche en ambre (`--c-amber`), côté formateur uniquement.
- **`.quatuor-thread`** : fil de marque — fine barre 4 couleurs (quatuor) sous
  le hero de la landing et le titre du vérificateur. Prolonge les `.code-tiles`
  sans copier de glyphes Kahoot. Toujours `aria-hidden`.
- **`.choice-card`** (+ `--on`, `--sm`, `__icon`, `__title`, `__desc`, conteneurs
  `.choice-cards` / `.choice-cards--row`) : options sélectionnables icônées —
  mode Libre/Examen, capacité, type de question. Boutons avec `aria-pressed`
  dans un `role="group"` ; l'état sélectionné = bordure accent + ✓.
- **`.empty-state`** (+ `--inline`, `__icon`, `__title`, composant
  `EmptyState.jsx`) : état vide piloté par icône — badge teinté accent + une
  ligne + action. Remplace les paragraphes d'explication des listes vides.
- **`.hint` / `.hint--warn`** : ligne courte icône + texte — remplace les
  paragraphes `tiny muted` explicatifs. L'icône porte l'affordance, le texte
  reste minimal.
- **`.chip` / `.chip--on` / `.chips`** : presets tactiles (montants du
  portefeuille, durées de quiz) — sélection = fond accent, texte sombre.
- **`.icon-badge`** (+ modificateurs `--sky/--amber/--coral/--mint`) : icône de
  tête des lignes de liste (historique, classes, transactions).
- **`.stat__icon`** (+ mêmes modificateurs) : icône au-dessus du chiffre des
  tuiles `.stat`.
- **`.pill--ok/--warn/--bad`** : statuts colorés (transactions, validation) —
  toujours accompagnés d'une icône et d'un libellé, jamais couleur seule.
- **`.podium-medal--1/2/3` / `.lb-rank--1/2/3`** : rangs teintés
  or/argent(sky)/bronze(coral) — médailles du podium en icône `medal`.
- **Landing** : le hero (« Un code, un pseudo, et c'est parti. ») est la seule
  voix du message — pas d'illustration redondante des étapes. Le placeholder
  du champ code s'écrit « ex. … » en casse/espacement de phrase pour ne jamais
  ressembler à un code saisi.
- **Visite guidée** (`HostTour.jsx`, `.driver-popover.valio-tour`) : overlay de
  bulles ancrées sur les vrais éléments de l'écran de création, pas une page à
  lire. Seule dépendance UI du projet — `driver.js` (MIT, zéro dépendance,
  ~8 Ko gzip) : exception assumée au principe « pas de dépendance décorative »
  (PRODUCT.md #5), tenable parce qu'elle est chargée à la demande
  (`dynamic(ssr:false)`) dans un chunk isolé, **absent des écrans participants**. Se lance seule au premier passage sur `/host` (**invités compris** — le
  parcours Libre entier se fait sans compte), état versionné en `localStorage`
  (`src/lib/onboarding.js` ; incrémenter `TOUR_VERSION` la rejoue pour tous).
  Relance par le lien nav/footer (`/host?tour=1`) ou l'évènement
  `valio:tour:start` ; `/host/welcome` est conservée en simple redirection.
  Lecture guidée : les clics sont bloqués pendant la visite, ce qui fige le
  nombre d'étapes et empêche `AuthModal` de s'ouvrir sous l'overlay. Sous
  1024px, l'étape « nav » passe en bulle centrée — la nav y est un scroller
  tronqué qui n'apprend rien.
  **Thème** : chaque règle doit porter le double sélecteur
  `.driver-popover.valio-tour`, car `driver.css` est chargé après `globals.css`
  et gagnerait à spécificité égale — un sélecteur sans le suffixe est ignoré en
  silence. La police passe par `--driver-popover-font-family` (l'API de la lib)
  et non par une surcharge, `all: unset` cassant l'héritage.

## Layout & Spacing

- **Shell formateur** (`HostShell` + `src/app/host/layout.jsx`) : toutes les
  pages `/host/*` vivent dans une grille header (sticky, compte + solde ambre +
  déconnexion ; en mode invité, « Connexion » ouvre `AuthModal` depuis
  n'importe quelle page) / nav latérale 248px (icône + libellé, état actif
  teinté accent, barre horizontale sous 1024px) / espace de travail (max
  1160px, gouttières `clamp`) / footer slim. Lobby et suivi de session passent
  en mode `--focus` (nav masquée pour la projection).
- `.work-grid` : contenu principal + panneau latéral 330px (1 colonne < 900px).
- Côté participants : layouts focalisés plein écran conservés (zéro friction,
  une action par écran) — le shell est un pattern formateur.
- **Consultation publique** (`/verifier`) : page autonome hors shell, registre
  sobre (aucun élément game-show — ni podium, ni points, note /20 uniquement).
  Saisie du code `VF-XXXX-XXXX` puis fiche : en-tête examen, `stat-grid`,
  classement en `.lb` avec la note en chiffre fort. Deep-link `?code=`.
- **`CopyButton`** : pattern de copie (icône `copy` → `check` + « Copié ! »
  2 s, `aria-live="polite"`) — utilisé pour le code de consultation (fin
  d'examen, historique, carnet de notes).
- Conteneur participant max 1040px (`.container`), variante étroite 560px.
- Espacement : utilitaires `gap-8/12/16/24` ; padding cartes 26px.
- `min-height: 100dvh`, safe-area sur le padding bas.
- Grilles : `auto-fit, minmax(140px, 1fr)` pour les stats ; réponses 2 col → 1
  col sous 560px.

## Motion

- Micro-transitions 120–200ms ; modales 160–200ms (fade + translateY 8px).
- `prefers-reduced-motion: reduce` coupe tout sauf `.spin` (état essentiel).
- Apparition des chips participants : `pop` 300ms ; pastilles cyclant sur le
  quatuor (`nth-child`).
- Chrono `.ring--low` : pulsation `scale(1.04)` 1s (urgence < 10 s).

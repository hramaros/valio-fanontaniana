// Icônes SVG inline (style Lucide, trait 2px) — remplace les émojis
// structurels pour un rendu identique sur toutes les plateformes.
const PATHS = {
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 21h14" />
    </>
  ),
  close: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  check: <path d="m4 12.5 5.5 5.5L20 6.5" />,
  play: <path d="M7 4.5v15l13-7.5Z" />,
  arrowRight: (
    <>
      <path d="M4 12h16" />
      <path d="m14 6 6 6-6 6" />
    </>
  ),
};

export default function Icon({ name, size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name] || null}
    </svg>
  );
}

// Formes des tuiles de réponse (langage « game show ») : identification
// indépendante de la couleur pour les participants daltoniens.
const SHAPES = [
  <path key="tri" d="M12 4 21 20H3Z" fill="currentColor" stroke="none" />,
  <rect key="sq" x="4.5" y="4.5" width="15" height="15" rx="2" fill="currentColor" stroke="none" />,
  <circle key="ci" cx="12" cy="12" r="8.5" fill="currentColor" stroke="none" />,
  <path key="di" d="M12 3l8.5 9L12 21l-8.5-9Z" fill="currentColor" stroke="none" />,
  <path key="pe" d="M12 3.5 20.5 10l-3.2 10H6.7L3.5 10Z" fill="currentColor" stroke="none" />,
  <path key="st" d="m12 3 2.7 6.1 6.3.6-4.8 4.4 1.4 6.4L12 17.2 6.4 20.5l1.4-6.4L3 9.7l6.3-.6Z" fill="currentColor" stroke="none" />,
];

export function ShapeGlyph({ index, size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {SHAPES[index % SHAPES.length]}
    </svg>
  );
}

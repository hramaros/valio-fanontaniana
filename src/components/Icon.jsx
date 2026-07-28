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
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v18h18" />
      <path d="M8 17v-6" />
      <path d="M13 17V7" />
      <path d="M18 17v-4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="7.5" r="3.5" />
      <path d="M2.5 20v-1.5a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5V20" />
      <path d="M15.5 4.6a3.5 3.5 0 0 1 0 5.8" />
      <path d="M21.5 20v-1.5a5 5 0 0 0-3.5-4.77" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 9a3 3 0 0 1 5.8 1c0 2-3 2.4-3 4" />
      <path d="M12 17.4h.01" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14" r="1" />
    </>
  ),
  trophy: (
    <>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M6 2h12v7a6 6 0 0 1-12 0Z" />
      <path d="M12 15v3" />
      <path d="M8 21h8" />
      <path d="M9.5 18h5l.5 3h-6Z" />
    </>
  ),
  medal: (
    <>
      <circle cx="12" cy="15" r="5.5" />
      <path d="m8.5 10.5-4-8.5" />
      <path d="M4.5 2h4l3 6.5" />
      <path d="m15.5 10.5 4-8.5" />
      <path d="M19.5 2h-4l-3 6.5" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5.2" />
      <circle cx="12" cy="12" r="1.4" />
    </>
  ),
  zap: <path d="M13 2 3.5 13.5H11L10 22l9.5-11.5H13L13 2Z" />,
  timer: (
    <>
      <path d="M10 2h4" />
      <circle cx="12" cy="14" r="8" />
      <path d="M12 14V9.5" />
    </>
  ),
  sparkles: (
    <>
      <path d="M11 4.5 12.9 9.6 18 11.5l-5.1 1.9L11 18.5l-1.9-5.1L4 11.5l5.1-1.9Z" />
      <path d="M19 3v4" />
      <path d="M21 5h-4" />
      <path d="M18.5 16.5v3" />
      <path d="M20 18h-3" />
    </>
  ),
  penLine: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  circleDot: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="1.6" />
    </>
  ),
  listChecks: (
    <>
      <path d="m3 6.5 1.7 1.7L8 4.9" />
      <path d="m3 16.5 1.7 1.7L8 14.9" />
      <path d="M12 6h9" />
      <path d="M12 12h9" />
      <path d="M12 18h9" />
    </>
  ),
  shieldCheck: (
    <>
      <path d="M12 22c-4.2-1.5-8-4.2-8-9V6c2.3 0 5-1.2 8-3.5C15 4.8 17.7 6 20 6v7c0 4.8-3.8 7.5-8 9Z" />
      <path d="m8.8 12 2.2 2.2L15.4 9.8" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  mail: (
    <>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
      <path d="m2.5 8 8.4 5.3a2 2 0 0 0 2.2 0L21.5 8" />
    </>
  ),
  creditCard: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 10h19" />
      <path d="M6 15h4" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5" />
      <path d="M3.5 3.5v5h5" />
      <path d="M12 7.5V12l3.2 2" />
    </>
  ),
  graduationCap: (
    <>
      <path d="m2 9.5 10-5 10 5-10 5Z" />
      <path d="M6.5 11.8V16c0 1.7 2.5 3 5.5 3s5.5-1.3 5.5-3v-4.2" />
      <path d="M22 9.5V15" />
    </>
  ),
  bookOpen: (
    <>
      <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2Z" />
      <path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7Z" />
    </>
  ),
  userPlus: (
    <>
      <circle cx="9" cy="7.5" r="3.5" />
      <path d="M2.5 20v-1.5a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5V20" />
      <path d="M19 7v6" />
      <path d="M22 10h-6" />
    </>
  ),
  trash: (
    <>
      <path d="M3.5 6.5h17" />
      <path d="M18.5 6.5V19a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V6.5" />
      <path d="M8.5 6.5V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  alertTriangle: (
    <>
      <path d="M10.3 4 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4" />
      <path d="M12 17h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16.5v-5" />
      <path d="M12 8h.01" />
    </>
  ),
  inbox: (
    <>
      <path d="M22 13h-5.5l-2 3h-5l-2-3H2" />
      <path d="M5.6 5.1 2 13v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4l-3.6-7.9A2 2 0 0 0 16.6 4H7.4a2 2 0 0 0-1.8 1.1Z" />
    </>
  ),
  link: (
    <>
      <path d="M10 13.5a5 5 0 0 0 7.5.5l2.5-2.5a5 5 0 0 0-7-7L11.5 6" />
      <path d="M14 10.5a5 5 0 0 0-7.5-.5L4 12.5a5 5 0 0 0 7 7l1.5-1.5" />
    </>
  ),
  menu: (
    <>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </>
  ),
  gauge: (
    <>
      <path d="M12 14 15.5 9" />
      <circle cx="12" cy="14" r="1.3" />
      <path d="M4 18a9 9 0 1 1 16 0" />
    </>
  ),
  trendingUp: (
    <>
      <path d="M3 16.5 9.5 10l3.5 3.5L21 5.5" />
      <path d="M15.5 5.5H21v5.5" />
    </>
  ),
  banknote: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M6 9.5h.01" />
      <path d="M18 14.5h.01" />
    </>
  ),
  hash: (
    <>
      <path d="M4.5 9h15" />
      <path d="M4.5 15h15" />
      <path d="M10.5 3.5 8 20.5" />
      <path d="M16.5 3.5 14 20.5" />
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

export const DEFAULT_COLORS = ["#ff5d73", "#38a8ff", "#ffc24b", "#32d267"];

// Choisit un texte sombre/clair lisible sur une couleur de fond donnée.
export function readableText(hex) {
  const c = (hex || "#000000").replace("#", "");
  if (c.length < 6) return "#161228";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#161228" : "#fff";
}

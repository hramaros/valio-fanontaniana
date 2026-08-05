// Lien vers le site vitrine (domaine séparé : valio-fanontaniana.mg).
// L'app ne fait pas de persuasion — elle renvoie vers la vitrine, qui s'en charge.
// Voir .agents/site-vitrine.md.
//
// Les liens sont tagués UTM pour mesurer la boucle virale participant → formateur :
// c'est le moteur d'acquisition le moins cher du produit, il faut pouvoir le compter.

// Next.js remplace `process.env.NEXT_PUBLIC_*` à la compilation — la référence
// doit rester littérale pour être inlinée côté client.
const BASE =
  process.env.NEXT_PUBLIC_MARKETING_URL || "https://valio-fanontaniana.mg";

/**
 * URL de la vitrine, taguée UTM.
 * @param {string} source - d'où vient le clic (ex. "result", "home").
 * @param {string} [path] - chemin sur la vitrine (défaut : accueil).
 */
export function marketingUrl(source, path = "/") {
  const base = BASE.replace(/\/+$/, "");
  const clean = path.startsWith("/") ? path : `/${path}`;
  const url = `${base}${clean === "/" ? "" : clean}`;
  if (!source) return url || base;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}utm_source=app&utm_medium=referral&utm_content=${encodeURIComponent(source)}`;
}

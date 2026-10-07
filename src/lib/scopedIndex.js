import { getRedis } from "./redis.js";

// Index datés scopés à un compte (ou une classe) : « les examens de ce
// formateur », « les recharges de ce compte ».
//
// Pourquoi ce module existe : ces index étaient des listes `LPUSH` + `LTRIM`
// plafonnées à 200. Le plafond ne libérait RIEN — les documents pointés
// (`examRecord:*`, `txn:*`) n'ont pas de TTL et survivaient à leur éviction de
// la liste. La 201e entrée rendait donc la première inatteignable sans rien
// récupérer en échange : une perte silencieuse, sur un carnet de notes ou une
// écriture comptable. Ce sont désormais des ZSET scorés par date, sans
// troncature, lus par curseur.
//
// La logique est centralisée ici parce qu'elle est pleine de pièges (ordre des
// bornes de ZRANGE REV, ex æquo à la milliseconde, union dédoublonnée avec la
// liste héritée). Deux copies auraient divergé.

export const PAGE_MAX = 200; // borne d'une requête, et non un plafond de stock

/**
 * Ordre total, identique à celui de Redis en mode REV : date décroissante,
 * puis identifiant décroissant (REV départage les ex æquo en ordre
 * lexicographique inverse).
 *
 * Avoir cet ordre écrit une seule fois est ce qui permet au curseur de rester
 * cohérent, que l'entrée vienne du ZSET ou de la liste héritée.
 */
const compare = (a, b, at) =>
  at(b) - at(a) || String(b?.id ?? "").localeCompare(String(a?.id ?? ""));

/**
 * Identifiants d'un index, du plus récent au plus ancien, en fusionnant le
 * ZSET et la liste héritée. On sur-récupère volontairement : les deux sources
 * peuvent se recouvrir, le tri et la découpe définitifs se font sur les
 * documents, seuls porteurs de la date.
 */
async function recentIds(zKey, legacyKey, count, cursor) {
  const redis = getRedis();
  const ids = [];

  if (cursor === null) {
    const all = await redis.zrange(zKey, "+inf", "-inf", {
      byScore: true,
      rev: true,
      offset: 0,
      count,
    });
    if (Array.isArray(all)) ids.push(...all);
  } else {
    // Les ex æquo du curseur d'abord : plusieurs entrées peuvent partager la
    // milliseconde de fin de page. Les écarter en bloc (borne exclusive seule)
    // les ferait disparaître — exactement la perte silencieuse qu'on corrige.
    const tied = await redis.zrange(zKey, cursor.at, cursor.at, {
      byScore: true,
      rev: true,
    });
    if (Array.isArray(tied) && cursor.id) {
      const pos = tied.indexOf(cursor.id);
      // `pos < 0` : le curseur ne vient pas du ZSET (entrée héritée). Le
      // filtre final tranchera, on ne devine pas ici.
      if (pos >= 0) ids.push(...tied.slice(pos + 1));
    }
    // Puis les strictement plus anciennes. `(x` PUIS `-inf` : avec REV, Redis
    // attend ses bornes dans l'ordre inverse, et le client Upstash les
    // transmet sans rien réordonner — l'ordre naturel donnerait un intervalle
    // vide.
    const older = await redis.zrange(zKey, `(${cursor.at}`, "-inf", {
      byScore: true,
      rev: true,
      offset: 0,
      count,
    });
    if (Array.isArray(older)) ids.push(...older);
  }

  if (ids.length >= count || !legacyKey) return ids;
  // La liste héritée était plafonnée à 200 : bornée par construction, on la
  // lit d'un bloc. Lecture seule — plus personne n'y écrit.
  const legacy = await redis.lrange(legacyKey, 0, PAGE_MAX - 1);
  if (!Array.isArray(legacy) || legacy.length === 0) return ids;
  const seen = new Set(ids);
  for (const id of legacy) {
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Documents d'un index scopé, du plus récent au plus ancien.
 *
 * Curseur : `before` (date du dernier document rendu) et `afterId` (son
 * identifiant). Les deux ensemble forment une clé unique même quand plusieurs
 * entrées partagent la même milliseconde ; `before` seul suffit quand on veut
 * tout ce qui précède strictement une date.
 *
 * L'union avec la liste héritée rend l'ordre entre déploiement et rattrapage
 * indifférent : un compte peut avoir des entrées des deux côtés sans qu'aucune
 * ne disparaisse.
 */
export async function recentDocs({
  zKey,
  legacyKey,
  docKey,
  dateField,
  limit,
  before,
  afterId,
}) {
  const count = Math.max(1, Math.min(Number(limit) || 50, PAGE_MAX));
  const at = (d) => Number(d?.[dateField]) || 0;
  const cursor = Number.isFinite(Number(before))
    ? { at: Number(before), id: afterId || null }
    : null;

  const ids = await recentIds(zKey, legacyKey, count, cursor);
  if (ids.length === 0) return [];

  const docs = await getRedis().mget(...ids.map(docKey));
  // L'union ZSET + liste héritée n'a pas d'ordre global : on trie ici, sur la
  // seule source de vérité de la date.
  const found = docs.filter(Boolean).sort((a, b) => compare(a, b, at));

  if (cursor === null) return found.slice(0, count);
  return found
    .filter((d) => {
      const t = at(d);
      if (t !== cursor.at) return t < cursor.at;
      // Ex æquo : on ne garde que ce qui suit le curseur dans l'ordre total.
      return cursor.id ? String(d.id) < String(cursor.id) : false;
    })
    .slice(0, count);
}

/**
 * Nombre d'entrées d'un index scopé. Permet de savoir s'il reste une page à
 * charger sans rapatrier tout l'historique.
 */
export async function countScoped(zKey, legacyKey) {
  const redis = getRedis();
  const [z, legacy] = await Promise.all([
    redis.zcard(zKey),
    legacyKey ? redis.llen(legacyKey) : 0,
  ]);
  // Les deux sources se recouvrent après rattrapage : on prend le maximum,
  // pas la somme, qui compterait deux fois les mêmes entrées.
  return Math.max(Number(z) || 0, Number(legacy) || 0);
}

// — Transport HTTP du curseur —
//
// Factorisé pour que chaque route n'ait pas sa propre interprétation de
// `?before=` : un curseur mal relu, c'est une page sautée en silence.

/** Lit un curseur de pagination depuis l'URL d'une requête. */
export function cursorFromRequest(url) {
  const q = new URL(url).searchParams;
  const before = Number(q.get("before"));
  if (!Number.isFinite(before) || before <= 0) return {};
  const afterId = q.get("afterId");
  return afterId ? { before, afterId } : { before };
}

/**
 * Curseur de la page suivante, ou `null` quand il n'y a plus rien derrière.
 * Une page incomplète signifie qu'on a atteint le fond.
 */
export function nextCursor(page, size, dateField) {
  if (!Array.isArray(page) || page.length < size) return null;
  const last = page[page.length - 1];
  return { before: Number(last?.[dateField]) || 0, afterId: last?.id ?? null };
}

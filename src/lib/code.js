// Alphabet sans caractères ambigus (pas de 0/O, 1/I, etc.) pour des codes lisibles.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Génère un code de salle de `len` caractères (défaut 6). */
export function generateCode(len = 6) {
  let code = "";
  for (let i = 0; i < len; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

/** Normalise un code saisi par l'utilisateur (majuscules, sans espaces). */
export function normalizeCode(input) {
  return String(input || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .trim();
}

/**
 * Code de consultation publique d'un examen : `VF-XXXX-XXXX`.
 * 8 caractères de l'alphabet non ambigu (31^8 ≈ 8,5 × 10¹¹ combinaisons).
 */
export function generateVerifyCode() {
  return `VF-${generateCode(4)}-${generateCode(4)}`;
}

/**
 * Normalise un code de consultation saisi (minuscules, espaces, tirets,
 * préfixe VF optionnel) vers la forme canonique `VF-XXXX-XXXX`.
 * Retourne null si la saisie ne peut pas correspondre à un code.
 */
export function normalizeVerifyCode(input) {
  let raw = String(input || "")
    .toUpperCase()
    .replace(/[\s-]+/g, "");
  // Préfixe VF optionnel — on ne le retire que si la longueur le confirme
  // (le corps du code peut lui-même commencer par « VF »).
  if (raw.length === 10 && raw.startsWith("VF")) raw = raw.slice(2);
  if (raw.length !== 8) return null;
  return `VF-${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** Génère un identifiant opaque (jeton joueur, id de question/réponse). */
export function generateId(prefix = "") {
  const rand =
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 6);
  return prefix ? `${prefix}_${rand}` : rand;
}

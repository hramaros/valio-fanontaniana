// Passage de l'import Google Forms vers l'éditeur, via `sessionStorage`.
//
// Pourquoi un relais et non un enregistrement : un formulaire qui n'est pas
// configuré en « questionnaire » n'a aucune bonne réponse, et `validateQuiz`
// refuse une question à choix sans bonne réponse. L'import ne peut donc rien
// persister — il dépose le quiz ici, l'éditeur le reprend, et c'est
// l'enregistrement qui valide.
//
// Module à part pour que l'éditeur n'ait pas à importer le module de page de
// la bibliothèque juste pour une constante : cela embarquerait toute la page
// dans son bundle.

const CLE = "valio:quiz-importe";

/** Dépose un import. Renvoie `false` si le navigateur refuse le stockage. */
export function deposerImport(charge) {
  try {
    sessionStorage.setItem(CLE, JSON.stringify(charge));
    return true;
  } catch {
    return false;
  }
}

/**
 * Reprend l'import déposé, et l'efface aussitôt : un rechargement de
 * l'éditeur ne doit pas réimporter le formulaire par-dessus le travail en
 * cours.
 */
export function reprendreImport() {
  try {
    const brut = sessionStorage.getItem(CLE);
    if (!brut) return null;
    sessionStorage.removeItem(CLE);
    return JSON.parse(brut);
  } catch {
    return null;
  }
}

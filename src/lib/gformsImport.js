// Import d'un Google Form à partir de son lien public.
//
// POURQUOI PAR LE LIEN ET NON PAR L'API. L'API Forms officielle exigerait le
// scope `forms.body.readonly`, classé sensible par Google : une vérification
// de l'application est obligatoire avant tout usage public, avec plusieurs
// semaines de délai. Le lien public, lui, fonctionne immédiatement. L'API
// restera le second chemin, quand la vérification sera obtenue — les deux
// alimenteront le même écran de relecture.
//
// CE SUR QUOI ON S'APPUIE EST NON DOCUMENTÉ. La page publique d'un formulaire
// embarque la variable `FB_PUBLIC_LOAD_DATA_`, un tableau JSON décrivant les
// questions. Google peut en changer la forme sans préavis. Tout le parsing est
// donc défensif : à la moindre structure inattendue, la question est IGNORÉE
// et SIGNALÉE, jamais devinée. Un import qui annonce « 3 questions non
// reprises » est utilisable ; un import qui en perd trois en silence ne l'est
// pas.
//
// LE CORRIGÉ N'EXISTE PAS TOUJOURS. Un Google Form n'a de bonnes réponses que
// s'il a été configuré en « questionnaire ». Un formulaire de sondage ordinaire
// n'en a aucune, et `validateQuiz` refuse une question à choix sans bonne
// réponse. L'import ne persiste donc rien : il rend un quiz que le formateur
// complète dans l'éditeur, et c'est l'enregistrement qui valide.

/** Hôtes autorisés. Toute autre cible est refusée — voir `assertSafeUrl`. */
const HOSTS_AUTORISES = new Set(["docs.google.com", "forms.gle"]);

/** Taille maximale de la page téléchargée. Une page de formulaire fait ~1 Mo. */
export const MAX_HTML_BYTES = 8 * 1024 * 1024;

/** Délai au-delà duquel on abandonne le téléchargement. */
export const FETCH_TIMEOUT_MS = 8000;

/** Durée attribuée par défaut, par question — Google Forms n'en porte aucune. */
export const DEFAULT_SEC_PER_QUESTION = 60;

/**
 * Types d'items Google Forms, repérés par leur code numérique, et ce vers quoi
 * on les traduit. Les items absents de cette table sont signalés comme non
 * repris : une grille ou une échelle n'a pas d'équivalent noté chez nous, et
 * la convertir approximativement serait pire que de l'annoncer.
 */
const TYPES = {
  0: { cible: "short", libelle: "réponse courte" },
  1: { cible: "free", libelle: "paragraphe" },
  2: { cible: "single", libelle: "choix multiple" },
  3: { cible: "single", libelle: "liste déroulante" },
  4: { cible: "multiple", libelle: "cases à cocher" },
};

/** Codes qui relèvent de la mise en page, et non d'une question perdue. */
const STRUCTURE = new Set([6, 8, 11, 13]);

const NON_REPRIS = {
  5: "échelle linéaire",
  6: "titre de section",
  7: "grille de choix",
  8: "saut de page",
  9: "date",
  10: "heure",
  11: "image",
  13: "vidéo",
};

/**
 * Valide et normalise un lien de formulaire.
 *
 * C'est la barrière anti-SSRF : l'application va émettre une requête sortante
 * vers une URL fournie par l'utilisateur. Sans liste blanche d'hôtes, ce
 * champ permettrait de faire sonder par le serveur n'importe quelle adresse
 * interne (metadata cloud, services privés). On n'autorise donc que les deux
 * hôtes de Google, en HTTPS, et rien d'autre.
 */
export function parseGoogleFormUrl(input) {
  const brut = String(input || "").trim();
  if (!brut) return { ok: false, error: "Collez le lien de votre formulaire." };

  let url;
  try {
    url = new URL(brut);
  } catch {
    return { ok: false, error: "Ce lien n'est pas une URL valide." };
  }
  if (url.protocol !== "https:") {
    return { ok: false, error: "Le lien doit commencer par https://" };
  }
  if (!HOSTS_AUTORISES.has(url.hostname)) {
    return {
      ok: false,
      error:
        "Seuls les liens Google Forms sont acceptés (docs.google.com ou forms.gle).",
    };
  }
  if (url.hostname === "docs.google.com" && !url.pathname.startsWith("/forms/")) {
    return { ok: false, error: "Ce lien Google ne pointe pas vers un formulaire." };
  }
  // On ne garde ni la requête ni le fragment : un lien de réponse pré-remplie
  // en traîne parfois, et ils n'apportent rien à la lecture du formulaire.
  return { ok: true, url: `${url.origin}${url.pathname}` };
}

/** Extrait le bloc `FB_PUBLIC_LOAD_DATA_` d'une page de formulaire. */
export function extractPublicLoadData(html) {
  const texte = String(html || "");
  const debut = texte.indexOf("FB_PUBLIC_LOAD_DATA_");
  if (debut < 0) return null;
  const egal = texte.indexOf("=", debut);
  if (egal < 0) return null;
  // Le bloc se termine par `;</script>`. On borne la recherche à partir du `=`
  // pour ne pas ramasser un autre script de la page.
  const fin = texte.indexOf("</script>", egal);
  const corps = texte.slice(egal + 1, fin < 0 ? undefined : fin).trim();
  const sansPointVirgule = corps.endsWith(";") ? corps.slice(0, -1) : corps;
  try {
    const data = JSON.parse(sansPointVirgule);
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/** Toutes les chaînes d'une structure imbriquée, à plat. */
function collecterChaines(noeud, sortie = [], profondeur = 0) {
  if (profondeur > 12) return sortie;
  if (typeof noeud === "string") sortie.push(noeud);
  else if (Array.isArray(noeud)) {
    for (const enfant of noeud) collecterChaines(enfant, sortie, profondeur + 1);
  }
  return sortie;
}

/**
 * Traduit un formulaire en quiz.
 *
 * Renvoie `{ quiz, ignores, corrigeDetecte }`. `ignores` liste ce qui n'a pas
 * été repris, avec la raison — c'est ce qui permet au formateur de savoir quoi
 * ressaisir à la main.
 */
export function mapFormToQuiz(data, { secPerQuestion = DEFAULT_SEC_PER_QUESTION } = {}) {
  const titre = String(data?.[1]?.[8] || data?.[3] || "Quiz importé").slice(0, 120);
  const items = Array.isArray(data?.[1]?.[1]) ? data[1][1] : [];

  const questions = [];
  const ignores = [];
  let corrigeDetecte = false;

  for (const item of items) {
    if (!Array.isArray(item)) continue;
    const intitule = String(item[1] || "").trim();
    const code = Number(item[3]);

    if (NON_REPRIS[code] !== undefined) {
      // Distinction essentielle, apprise sur formulaires réels : un titre de
      // section ou un saut de page n'est PAS une question perdue, c'est de la
      // mise en page. Les mêler aux vraies pertes donnait « 9 éléments non
      // repris » là où seuls 3 demandaient une ressaisie — un rapport qui
      // alarme sans informer. On les signale quand même, mais à part.
      if (intitule && code !== 8) {
        ignores.push({
          titre: intitule,
          critique: !STRUCTURE.has(code),
          raison: `${NON_REPRIS[code]} — non pris en charge`,
        });
      }
      continue;
    }

    const mappage = TYPES[code];
    if (!mappage) {
      ignores.push({
        titre: intitule || `Question de type ${code}`,
        critique: true,
        raison: "type de question inconnu",
      });
      continue;
    }
    if (!intitule) {
      ignores.push({
        titre: "(sans intitulé)",
        critique: true,
        raison: "question sans texte",
      });
      continue;
    }

    const corps = item[4]?.[0];
    const notation = corps?.[4];
    const chainesCorrige = notation ? collecterChaines(notation) : [];
    // Points Google (1, 2, 5…) convertis en poids maison. `basePoints` sert de
    // poids dans la note pondérée ; 1000 est la valeur par défaut du produit,
    // on garde donc ce pas pour préserver les rapports entre questions.
    const pointsGoogle = Number(notation?.[0]?.[0]);
    const basePoints = Number.isFinite(pointsGoogle) && pointsGoogle > 0
      ? Math.round(pointsGoogle * 1000)
      : 1000;

    const base = { text: intitule.slice(0, 500), basePoints };

    if (mappage.cible === "short" || mappage.cible === "free") {
      // Une réponse courte n'est corrigible automatiquement que si le
      // formulaire fournit la réponse attendue. Sinon on la verse en
      // `free` (correction à la main) plutôt que de livrer une question
      // `short` sans réponse acceptée, que `validateQuiz` refuserait.
      const attendues = chainesCorrige
        .map((c) => String(c).trim())
        .filter(Boolean)
        .slice(0, 10);
      if (mappage.cible === "short" && attendues.length > 0) {
        corrigeDetecte = true;
        questions.push({ ...base, type: "short", accepted: attendues });
      } else {
        questions.push({
          ...base,
          type: "free",
          reference: attendues[0] || "",
        });
      }
      continue;
    }

    const options = Array.isArray(corps?.[1]) ? corps[1] : [];
    // L'option « Autre » de Google se reconnaît à son drapeau en 5e position,
    // et porte un texte vide. Elle ne peut pas devenir une réponse notée : son
    // contenu est saisi par le répondant, il n'y a rien à corriger. On
    // l'écarte donc explicitement — et non par le seul effet du filtre sur les
    // textes vides, qui marchait par accident. Vérifié sur formulaire réel.
    const estAutre = (o) => o?.[4] === 1 || o?.[4] === true;
    const avecAutre = options.some(estAutre);
    const reponses = options
      .filter((o) => !estAutre(o))
      .map((o) => String(o?.[0] ?? "").trim())
      .filter(Boolean)
      .slice(0, 10);

    if (reponses.length < 2) {
      ignores.push({
        titre: intitule,
        critique: true,
        raison: avecAutre
          ? `une seule réponse proposée hors « Autre » — rien à départager`
          : "moins de deux réponses proposées",
      });
      continue;
    }

    const bonnes = new Set(chainesCorrige.map((c) => String(c).trim()));
    const answers = reponses.map((texte) => ({
      text: texte.slice(0, 240),
      color: "#4f46e5",
      correct: bonnes.has(texte),
    }));
    const nbBonnes = answers.filter((a) => a.correct).length;
    if (nbBonnes > 0) corrigeDetecte = true;

    // `single` n'accepte qu'une bonne réponse. Si le corrigé détecté en
    // désigne plusieurs, c'est que la question est en réalité à choix
    // multiples : on la reclasse plutôt que de la livrer invalide.
    const type =
      mappage.cible === "single" && nbBonnes > 1 ? "multiple" : mappage.cible;

    questions.push({ ...base, type, answers });
  }

  const quiz = {
    title: titre,
    // Mode Examen imposé : c'est le mode noté, et le seul qui accepte les
    // questions à saisie libre que produit un import.
    mode: "examen",
    capacity: "small",
    totalDurationSec: Math.max(
      60,
      questions.length * Math.max(10, Number(secPerQuestion) || DEFAULT_SEC_PER_QUESTION),
    ),
    questions,
  };

  return { quiz, ignores, corrigeDetecte };
}

/**
 * Télécharge et traduit un formulaire.
 *
 * `fetchImpl` est injectable pour les tests : aucun test de ce dépôt ne doit
 * dépendre du réseau.
 *
 * `redirect: "manual"` n'est pas un détail : laisser suivre les redirections
 * permettrait à un lien `forms.gle` de rebondir hors de Google, ce qui
 * reviendrait à annuler la liste blanche d'hôtes. On suit donc les sauts
 * nous-mêmes, en revalidant la cible à chaque fois.
 */
export async function importGoogleForm(input, { fetchImpl = fetch, maxHops = 3 } = {}) {
  const valide = parseGoogleFormUrl(input);
  if (!valide.ok) return { ok: false, status: 400, error: valide.error };

  let url = valide.url;
  let html = null;

  for (let saut = 0; saut <= maxHops; saut += 1) {
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), FETCH_TIMEOUT_MS);
    let reponse;
    try {
      reponse = await fetchImpl(url, {
        redirect: "manual",
        signal: controleur.signal,
        headers: { "user-agent": "valio-fanontaniana/import-google-forms" },
      });
    } catch (err) {
      return {
        ok: false,
        status: 502,
        error: "Impossible de joindre Google Forms. Réessayez dans un instant.",
        detail: String(err?.message || err).slice(0, 200),
      };
    } finally {
      clearTimeout(minuteur);
    }

    const code = Number(reponse?.status);
    if (code >= 300 && code < 400) {
      const cible = reponse.headers?.get?.("location");
      if (!cible) {
        return { ok: false, status: 502, error: "Redirection illisible depuis Google." };
      }
      // Revalidation complète de la cible : c'est tout l'intérêt du suivi
      // manuel. Une redirection relative est résolue contre l'URL courante.
      const suivant = parseGoogleFormUrl(new URL(cible, url).toString());
      if (!suivant.ok) {
        return {
          ok: false,
          status: 400,
          error: "Ce lien redirige hors de Google Forms.",
        };
      }
      url = suivant.url;
      continue;
    }

    if (code === 404 || code === 410) {
      // Le serveur ne peut pas distinguer « formulaire inexistant » de
      // « formulaire non partagé » : les deux se présentent comme un 404. Le
      // message couvre donc les deux causes. Le 410 (formulaire supprimé,
      // constaté en réel) relève du même message pour le formateur.
      //
      // Piège vérifié en réel : `/forms/d/e/{id}/viewform` renvoie 404 pour un
      // identifiant de formulaire ordinaire — le créneau `/d/e/` attend un
      // identifiant de PUBLICATION, différent. C'est `/forms/d/{id}/viewform`
      // qui répond. Les deux formes étant acceptées par `parseGoogleFormUrl`,
      // un formateur peut coller l'une ou l'autre, d'où l'utilité de citer le
      // partage ET le lien dans le message.
      return {
        ok: false,
        status: 404,
        error:
          "Formulaire inaccessible. Deux causes possibles : le lien est " +
          "erroné, ou le formulaire n'est pas partagé. Dans Google Forms, " +
          "ouvrez « Partager » et choisissez « Toute personne disposant du lien ».",
      };
    }
    if (code === 401 || code === 403) {
      return {
        ok: false,
        status: 403,
        error:
          "Ce formulaire n'est pas accessible publiquement. Dans Google Forms, " +
          "partagez-le avec « Toute personne disposant du lien ».",
      };
    }
    if (!reponse?.ok) {
      return { ok: false, status: 502, error: `Google a répondu ${code || "?"}.` };
    }

    html = await reponse.text();
    if (html.length > MAX_HTML_BYTES) {
      return { ok: false, status: 413, error: "Cette page est trop volumineuse." };
    }
    break;
  }

  if (html === null) {
    return { ok: false, status: 502, error: "Trop de redirections." };
  }

  const data = extractPublicLoadData(html);
  if (!data) {
    // Cas fréquent et précis : Google sert une page de connexion quand le
    // formulaire n'est pas public. Le dire vaut mieux qu'un « format
    // inattendu » que personne ne sait corriger.
    const connexion = /accounts\.google\.com|ServiceLogin/i.test(html);
    return {
      ok: false,
      status: connexion ? 403 : 422,
      error: connexion
        ? "Ce formulaire demande une connexion Google. Rendez-le accessible " +
          "par lien, le temps de l'import."
        : "Impossible de lire la structure de ce formulaire.",
    };
  }

  const { quiz, ignores, corrigeDetecte } = mapFormToQuiz(data);
  if (quiz.questions.length === 0) {
    return {
      ok: false,
      status: 422,
      error: "Aucune question exploitable dans ce formulaire.",
      ignores,
    };
  }

  return { ok: true, quiz, ignores, corrigeDetecte, sourceUrl: url };
}

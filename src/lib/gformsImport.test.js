import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseGoogleFormUrl,
  extractPublicLoadData,
  mapFormToQuiz,
  importGoogleForm,
  MAX_HTML_BYTES,
} from "./gformsImport.js";
import { validateQuiz } from "./rooms.js";

/* ------------------------------------------------------------------ */
/* Fabriques de structure Google Forms                                 */
/* ------------------------------------------------------------------ */

/**
 * Construit un item. `grading` reproduit la forme observée :
 * `[[points, [[null, [["BonneRéponse"]]]]]]`.
 */
function item(titre, type, { options = [], bonnes = null, points = null } = {}) {
  const corps = [
    "entry.1",
    options.map((o) => [o]),
    0, // non obligatoire
    null,
    bonnes ? [[points ?? 1, [[null, [bonnes]]]]] : null,
  ];
  return [1, titre, "", type, [corps]];
}

/**
 * Enveloppe d'un formulaire. Les indices ne sont pas arbitraires : dans
 * `FB_PUBLIC_LOAD_DATA_`, les items sont en `[1][1]` et le titre du document
 * en `[1][8]`. Les poser ailleurs ferait passer un test sur une structure que
 * Google ne produit pas.
 */
function form(titre, items) {
  const bloc = new Array(9).fill(null);
  bloc[1] = items;
  bloc[8] = titre;
  return [null, bloc];
}

const pageAvec = (data) =>
  `<!doctype html><html><body><script>var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify(
    data,
  )};</script></body></html>`;

/** Fausse réponse HTTP, suffisante pour `importGoogleForm`. */
function reponse(body, { status = 200, headers = {} } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    text: async () => body,
  };
}

/* ------------------------------------------------------------------ */
/* Barrière anti-SSRF                                                  */
/* ------------------------------------------------------------------ */

test("parseGoogleFormUrl n'accepte que Google Forms en HTTPS", async () => {
  const bons = [
    "https://docs.google.com/forms/d/e/1ABC/viewform",
    "https://docs.google.com/forms/d/1ABC/viewform",
    "https://forms.gle/abc123",
  ];
  for (const u of bons) {
    assert.equal(parseGoogleFormUrl(u).ok, true, u);
  }

  // Chacune de ces entrées ferait émettre au serveur une requête choisie par
  // l'utilisateur : c'est précisément ce que la liste blanche interdit.
  const mauvais = [
    "http://docs.google.com/forms/d/e/1ABC/viewform", // pas HTTPS
    "https://169.254.169.254/latest/meta-data/", // métadonnées cloud
    "https://localhost:6379/", // service interne
    "https://docs.google.com.evil.example/forms/d/e/1/viewform", // hôte leurre
    "https://docs.google.com/document/d/1ABC/edit", // Google, mais pas un formulaire
    "file:///etc/passwd",
    "",
    null,
  ];
  for (const u of mauvais) {
    assert.equal(parseGoogleFormUrl(u).ok, false, String(u));
  }
});

test("parseGoogleFormUrl retire requête et fragment", async () => {
  const r = parseGoogleFormUrl(
    "https://docs.google.com/forms/d/e/1ABC/viewform?usp=sf_link&entry.1=X#heading",
  );
  assert.equal(r.ok, true);
  assert.equal(r.url, "https://docs.google.com/forms/d/e/1ABC/viewform");
});

test("une redirection hors de Google est refusée, pas suivie", async () => {
  const appels = [];
  const fetchImpl = async (url) => {
    appels.push(url);
    return reponse("", {
      status: 302,
      headers: { location: "https://169.254.169.254/latest/meta-data/" },
    });
  };

  const r = await importGoogleForm("https://forms.gle/abc123", { fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.match(r.error, /hors de Google Forms/);
  assert.equal(appels.length, 1, "la cible interdite n'est jamais appelée");
});

test("une redirection vers Google est suivie et revalidée", async () => {
  const data = form("Contrôle", [
    item("2 + 2 ?", 2, { options: ["4", "5"], bonnes: ["4"] }),
  ]);
  const appels = [];
  const fetchImpl = async (url) => {
    appels.push(url);
    if (url === "https://forms.gle/abc123") {
      return reponse("", {
        status: 302,
        headers: { location: "https://docs.google.com/forms/d/e/1ABC/viewform" },
      });
    }
    return reponse(pageAvec(data));
  };

  const r = await importGoogleForm("https://forms.gle/abc123", { fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.sourceUrl, "https://docs.google.com/forms/d/e/1ABC/viewform");
  assert.deepEqual(appels, [
    "https://forms.gle/abc123",
    "https://docs.google.com/forms/d/e/1ABC/viewform",
  ]);
});

test("boucle de redirections : abandon propre", async () => {
  const fetchImpl = async () =>
    reponse("", {
      status: 302,
      headers: { location: "https://docs.google.com/forms/d/e/1ABC/viewform" },
    });
  const r = await importGoogleForm("https://docs.google.com/forms/d/e/1ABC/viewform", {
    fetchImpl,
    maxHops: 2,
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /Trop de redirections/);
});

/* ------------------------------------------------------------------ */
/* Lecture de la structure                                             */
/* ------------------------------------------------------------------ */

test("extractPublicLoadData lit le bloc, ou rend null sans lever", async () => {
  const data = form("T", [item("Q", 2, { options: ["a", "b"] })]);
  assert.deepEqual(extractPublicLoadData(pageAvec(data)), data);

  assert.equal(extractPublicLoadData("<html>rien</html>"), null);
  assert.equal(
    extractPublicLoadData("<script>var FB_PUBLIC_LOAD_DATA_ = {pas:'du json'};</script>"),
    null,
  );
  assert.equal(extractPublicLoadData(""), null);
  assert.equal(extractPublicLoadData(null), null);
});

test("extractPublicLoadData ne ramasse pas un script voisin", async () => {
  const data = form("T", [item("Q", 2, { options: ["a", "b"] })]);
  const html =
    `<script>var AUTRE = [1,2,3];</script>` +
    pageAvec(data) +
    `<script>var ENCORE = [4];</script>`;
  assert.deepEqual(extractPublicLoadData(html), data);
});

/* ------------------------------------------------------------------ */
/* Traduction en quiz                                                  */
/* ------------------------------------------------------------------ */

test("choix multiple avec corrigé : question prête à l'emploi", async () => {
  const data = form("Contrôle de géométrie", [
    item("Combien de côtés a un hexagone ?", 2, {
      options: ["6", "8", "4"],
      bonnes: ["6"],
      points: 2,
    }),
  ]);

  const { quiz, ignores, corrigeDetecte } = mapFormToQuiz(data);

  assert.equal(quiz.title, "Contrôle de géométrie");
  assert.equal(quiz.mode, "examen");
  assert.equal(ignores.length, 0);
  assert.equal(corrigeDetecte, true);

  const [q] = quiz.questions;
  assert.equal(q.type, "single");
  assert.equal(q.basePoints, 2000, "2 points Google → poids 2000");
  assert.deepEqual(
    q.answers.map((a) => [a.text, a.correct]),
    [
      ["6", true],
      ["8", false],
      ["4", false],
    ],
  );
  // Le quiz est directement valide : c'est le cas idéal.
  assert.equal(validateQuiz(quiz).ok, true);
});

test("formulaire de sondage : aucun corrigé, et on le dit", async () => {
  const data = form("Sondage", [
    item("Votre couleur préférée ?", 2, { options: ["Bleu", "Rouge"] }),
  ]);

  const { quiz, corrigeDetecte } = mapFormToQuiz(data);

  assert.equal(corrigeDetecte, false);
  assert.equal(quiz.questions[0].answers.every((a) => !a.correct), true);
  // Volontairement invalide : c'est au formateur de désigner la bonne réponse.
  const v = validateQuiz(quiz);
  assert.equal(v.ok, false);
  assert.match(v.error, /bonne réponse/);
});

test("cases à cocher → choix multiple, plusieurs bonnes réponses", async () => {
  const data = form("T", [
    item("Lesquels sont des nombres premiers ?", 4, {
      options: ["2", "3", "4"],
      bonnes: ["2", "3"],
    }),
  ]);
  const { quiz } = mapFormToQuiz(data);
  assert.equal(quiz.questions[0].type, "multiple");
  assert.equal(quiz.questions[0].answers.filter((a) => a.correct).length, 2);
  assert.equal(validateQuiz(quiz).ok, true);
});

test("un choix unique dont le corrigé désigne deux réponses est reclassé", async () => {
  const data = form("T", [
    item("Question mal configurée", 2, {
      options: ["A", "B", "C"],
      bonnes: ["A", "B"],
    }),
  ]);
  const { quiz } = mapFormToQuiz(data);
  assert.equal(
    quiz.questions[0].type,
    "multiple",
    "mieux vaut reclasser que livrer une question que validateQuiz refuse",
  );
  assert.equal(validateQuiz(quiz).ok, true);
});

test("réponse courte : corrigée automatiquement si Google fournit l'attendu", async () => {
  const data = form("T", [
    item("Capitale de Madagascar ?", 0, { bonnes: ["Antananarivo"] }),
  ]);
  const { quiz, corrigeDetecte } = mapFormToQuiz(data);
  assert.equal(quiz.questions[0].type, "short");
  assert.deepEqual(quiz.questions[0].accepted, ["Antananarivo"]);
  assert.equal(corrigeDetecte, true);
  assert.equal(validateQuiz(quiz).ok, true);
});

test("réponse courte sans attendu : versée en libre, pas en short invalide", async () => {
  const data = form("T", [item("Expliquez votre raisonnement", 0, {})]);
  const { quiz } = mapFormToQuiz(data);
  assert.equal(
    quiz.questions[0].type,
    "free",
    "une question `short` sans réponse acceptée serait refusée à l'enregistrement",
  );
  assert.equal(validateQuiz(quiz).ok, true);
});

test("paragraphe → réponse libre, avec corrigé indicatif si présent", async () => {
  const data = form("T", [
    item("Commentez cette citation", 1, { bonnes: ["Une piste de correction"] }),
  ]);
  const { quiz } = mapFormToQuiz(data);
  assert.equal(quiz.questions[0].type, "free");
  assert.equal(quiz.questions[0].reference, "Une piste de correction");
});

test("liste déroulante → choix unique", async () => {
  const data = form("T", [
    item("Choisissez", 3, { options: ["A", "B"], bonnes: ["B"] }),
  ]);
  const { quiz } = mapFormToQuiz(data);
  assert.equal(quiz.questions[0].type, "single");
  assert.equal(quiz.questions[0].answers[1].correct, true);
});

test("ce qui n'est pas repris est SIGNALÉ, jamais perdu en silence", async () => {
  const data = form("Mélange", [
    item("Bonne question", 2, { options: ["A", "B"], bonnes: ["A"] }),
    item("Notez de 1 à 5", 5, {}), // échelle linéaire
    item("Grille d'évaluation", 7, {}), // grille
    item("Votre date de naissance", 9, {}), // date
    item("Partie 2", 6, {}), // titre de section
    item("", 8, {}), // saut de page, sans intitulé
    item("Question exotique", 42, {}), // type inconnu
    item("Choix bancal", 2, { options: ["Seule option"] }), // < 2 réponses
  ]);

  const { quiz, ignores } = mapFormToQuiz(data);

  assert.equal(quiz.questions.length, 1, "une seule question exploitable");
  const titres = ignores.map((i) => i.titre);
  assert.deepEqual(titres, [
    "Notez de 1 à 5",
    "Grille d'évaluation",
    "Votre date de naissance",
    "Partie 2",
    "Question exotique",
    "Choix bancal",
  ]);
  assert.match(
    ignores.find((i) => i.titre === "Notez de 1 à 5").raison,
    /échelle linéaire/,
  );
  assert.match(
    ignores.find((i) => i.titre === "Choix bancal").raison,
    /moins de deux réponses/,
  );
  // Un saut de page sans intitulé n'encombre pas le rapport.
  assert.equal(titres.includes(""), false);
});

test("durée déduite du nombre de questions, jamais nulle", async () => {
  const trois = form("T", [
    item("A", 2, { options: ["1", "2"], bonnes: ["1"] }),
    item("B", 2, { options: ["1", "2"], bonnes: ["1"] }),
    item("C", 2, { options: ["1", "2"], bonnes: ["1"] }),
  ]);
  assert.equal(mapFormToQuiz(trois).quiz.totalDurationSec, 180);
  assert.equal(
    mapFormToQuiz(trois, { secPerQuestion: 120 }).quiz.totalDurationSec,
    360,
  );
  // Un formulaire vide ne doit pas produire une durée de 0, que
  // `validateQuiz` refuserait avec un message incompréhensible.
  assert.equal(mapFormToQuiz(form("T", [])).quiz.totalDurationSec, 60);
});

test("structure inattendue : on ignore, on ne devine pas", async () => {
  assert.deepEqual(mapFormToQuiz(null).quiz.questions, []);
  assert.deepEqual(mapFormToQuiz([]).quiz.questions, []);
  assert.deepEqual(mapFormToQuiz(form("T", [null, "texte", 42])).quiz.questions, []);
  assert.equal(mapFormToQuiz(form("T", [])).quiz.title, "T");
  // Un item à choix dont le corps manque totalement.
  const tronque = form("T", [[1, "Question", "", 2]]);
  assert.equal(mapFormToQuiz(tronque).ignores.length, 1);
});

test("les bornes de longueur de rooms.js sont respectées", async () => {
  const data = form("T".repeat(300), [
    item("Q".repeat(900), 2, {
      options: ["A".repeat(500), "B", ...Array.from({ length: 20 }, (_, i) => `O${i}`)],
      bonnes: ["B"],
    }),
  ]);
  const { quiz } = mapFormToQuiz(data);
  assert.equal(quiz.title.length, 120);
  assert.equal(quiz.questions[0].text.length, 500);
  assert.equal(quiz.questions[0].answers.length, 10, "au plus 10 réponses");
  assert.equal(quiz.questions[0].answers[0].text.length, 240);
});

/* ------------------------------------------------------------------ */
/* Erreurs réseau et formulaires non publics                           */
/* ------------------------------------------------------------------ */

test("formulaire non public : message actionnable", async () => {
  const page = `<html><body>Redirecting to accounts.google.com/ServiceLogin</body></html>`;
  const r = await importGoogleForm("https://docs.google.com/forms/d/e/1ABC/viewform", {
    fetchImpl: async () => reponse(page),
  });
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
  assert.match(r.error, /accessible par lien/);
});

test("403 de Google : on explique comment partager", async () => {
  const r = await importGoogleForm("https://docs.google.com/forms/d/e/1ABC/viewform", {
    fetchImpl: async () => reponse("", { status: 403 }),
  });
  assert.equal(r.status, 403);
  assert.match(r.error, /Toute personne disposant du lien/);
});

test("404 et panne réseau sont distingués", async () => {
  const absent = await importGoogleForm(
    "https://docs.google.com/forms/d/e/1ABC/viewform",
    { fetchImpl: async () => reponse("", { status: 404 }) },
  );
  assert.equal(absent.status, 404);
  // Google répond 404 pour un formulaire non partagé : le message doit donc
  // mentionner le partage, pas seulement un lien erroné.
  assert.match(absent.error, /pas partagé/);
  assert.match(absent.error, /disposant du lien/);

  const panne = await importGoogleForm(
    "https://docs.google.com/forms/d/e/1ABC/viewform",
    {
      fetchImpl: async () => {
        throw new Error("ECONNRESET");
      },
    },
  );
  assert.equal(panne.status, 502);
  assert.match(panne.error, /Impossible de joindre/);
  assert.match(panne.detail, /ECONNRESET/);
});

test("page illisible : 422 distinct du 403", async () => {
  const r = await importGoogleForm("https://docs.google.com/forms/d/e/1ABC/viewform", {
    fetchImpl: async () => reponse("<html>bonjour</html>"),
  });
  assert.equal(r.status, 422);
  assert.match(r.error, /Impossible de lire la structure/);
});

test("formulaire sans aucune question exploitable : 422 avec le détail", async () => {
  const data = form("Vide", [item("Notez de 1 à 5", 5, {})]);
  const r = await importGoogleForm("https://docs.google.com/forms/d/e/1ABC/viewform", {
    fetchImpl: async () => reponse(pageAvec(data)),
  });
  assert.equal(r.status, 422);
  assert.match(r.error, /Aucune question exploitable/);
  assert.equal(r.ignores.length, 1, "le formateur apprend ce qui a été écarté");
});

test("page démesurée : refus sans tenter de la lire", async () => {
  const r = await importGoogleForm("https://docs.google.com/forms/d/e/1ABC/viewform", {
    fetchImpl: async () => reponse("x".repeat(MAX_HTML_BYTES + 1)),
  });
  assert.equal(r.status, 413);
});

test("import complet : quiz, origine et rapport", async () => {
  const data = form("Évaluation de fin de chapitre", [
    item("2 + 2 ?", 2, { options: ["4", "5"], bonnes: ["4"] }),
    item("Notez ce cours", 5, {}),
  ]);
  const r = await importGoogleForm(
    "https://docs.google.com/forms/d/e/1ABC/viewform?usp=sf_link",
    { fetchImpl: async () => reponse(pageAvec(data)) },
  );

  assert.equal(r.ok, true);
  assert.equal(r.quiz.title, "Évaluation de fin de chapitre");
  assert.equal(r.quiz.questions.length, 1);
  assert.equal(r.corrigeDetecte, true);
  assert.equal(r.ignores.length, 1);
  assert.equal(
    r.sourceUrl,
    "https://docs.google.com/forms/d/e/1ABC/viewform",
    "l'origine est conservée, sans les paramètres",
  );
});

/* ------------------------------------------------------------------ */
/* Structures relevées sur formulaires réels                           */
/* ------------------------------------------------------------------ */

test("l'option « Autre » est écartée par son drapeau, pas par son texte vide", async () => {
  // Structure relevée telle quelle sur un formulaire réel : l'option « Autre »
  // porte un texte vide ET un drapeau `1` en 5e position.
  const reel = [
    1265741244,
    "Où exercez-vous principalement ?",
    null,
    2,
    [
      [
        57638704,
        [
          ["Madagascar", null, null, null, 0],
          ["", null, null, null, 1],
        ],
        1,
      ],
    ],
  ];
  const { quiz, ignores } = mapFormToQuiz(form("T", [reel]));

  assert.equal(quiz.questions.length, 0, "une seule vraie option : rien à départager");
  assert.equal(ignores[0].critique, true);
  assert.match(ignores[0].raison, /hors « Autre »/);
});

test("« Autre » ne compte pas comme réponse, mais ne disqualifie pas la question", async () => {
  const avecAutre = [
    1,
    "Quelle est votre matière préférée ?",
    null,
    2,
    [
      [
        1,
        [
          ["Mathématiques", null, null, null, 0],
          ["Histoire", null, null, null, 0],
          ["Sciences", null, null, null, 0],
          ["", null, null, null, 1],
        ],
        0,
      ],
    ],
  ];
  const { quiz } = mapFormToQuiz(form("T", [avecAutre]));
  assert.equal(quiz.questions.length, 1);
  assert.deepEqual(
    quiz.questions[0].answers.map((a) => a.text),
    ["Mathématiques", "Histoire", "Sciences"],
    "« Autre » est saisi par le répondant : il n'y a rien à corriger",
  );
});

test("structure et pertes réelles sont distinguées dans le rapport", async () => {
  const data = form("Sondage", [
    item("À propos de vous", 6, {}), // titre de section
    item("Bonne question", 2, { options: ["A", "B"], bonnes: ["A"] }),
    item("Notez de 1 à 5", 5, {}), // vraie perte
    item("Une image", 11, {}), // mise en page
  ]);

  const { ignores } = mapFormToQuiz(data);
  const pertes = ignores.filter((i) => i.critique);
  const structure = ignores.filter((i) => !i.critique);

  assert.deepEqual(
    pertes.map((i) => i.titre),
    ["Notez de 1 à 5"],
    "seule une question réellement perdue demande une ressaisie",
  );
  assert.deepEqual(
    structure.map((i) => i.titre),
    ["À propos de vous", "Une image"],
    "les titres de section et images sont signalés, mais à part",
  );
});

test("un formulaire supprimé (410) donne le même message qu'un 404", async () => {
  // Constaté en réel : Google répond 410 pour un formulaire supprimé. Vu du
  // formateur, c'est le même problème — le lien ne mène à rien.
  const r = await importGoogleForm("https://docs.google.com/forms/d/e/1ABC/viewform", {
    fetchImpl: async () => ({
      status: 410,
      ok: false,
      headers: { get: () => null },
      text: async () => "",
    }),
  });
  assert.equal(r.status, 404);
  assert.match(r.error, /inaccessible/);
});

# Persistance & historique des examens — Implementation Plan (Phase 3)

**Goal:** À la clôture d'un examen pro, sauvegarder durablement (hors TTL) un instantané rattaché au compte du formateur, et offrir une page « Mes examens » pour consulter l'historique et re-télécharger le PDF.

**Architecture:** À l'instant du settle (dans `getLeaderboard`, branche ended/Examen avec `hostAccountId`), on construit un enregistrement et on le pousse dans une liste Redis durable propre au compte. Module I/O isolé `src/lib/history.js`. Le mode Libre ne persiste rien.

**Tech Stack:** Redis (listes), `node:test`, Next.js route handlers, `jspdf` (réutilisé via `src/lib/pdf.js`).

## Global Constraints
- Persistance **uniquement** pour Examen avec `hostAccountId`. Libre = éphémère.
- Clés durables (sans TTL) : `examRecord:<id>`, `examHistory:<accountId>` (liste, plus récent en tête, plafonnée à 200).
- Le record contient de quoi ré-afficher et régénérer le PDF (réutilise `downloadHostResultsPdf`).
- Lecture d'un record : vérifier l'appartenance au compte connecté.

## File Structure
- **Create** `src/lib/history.js` (+ `history.test.js`) — saveExamRecord, listExamRecords, getExamRecord.
- **Modify** `src/lib/rooms.js` — au settle : construire + `saveExamRecord`. (+ test dans `rooms.test.js`)
- **Create** `src/app/api/host/history/route.js` (GET liste) et `src/app/api/host/history/[id]/route.js` (GET un record).
- **Create** `src/app/host/history/page.jsx` — liste + détail + bouton PDF.
- **Modify** `src/app/host/page.jsx` — lien « Mes examens » quand connecté.

## Tasks
1. **history.js** (TDD) : `saveExamRecord(record)`, `listExamRecords(accountId, limit)` (résumés), `getExamRecord(accountId, id)` (avec contrôle d'appartenance). Fake Redis avec listes (lpush/lrange/ltrim).
2. **Hook settle** dans `getLeaderboard` : si `hostAccountId`, construire le record (title, code, mode, capacity, priceAr, charged, nbQuestions, participantCount, endedAt, leaderboard, podium) et `saveExamRecord`. Test : après clôture d'un Examen avec compte, `listExamRecords` renvoie 1 entrée ; `getExamRecord` rend le détail.
3. **Routes** : `GET /api/host/history` (auth → liste) ; `GET /api/host/history/[id]` (auth + ownership → record).
4. **UI** `/host/history` : `useAccount`; si non connecté → invite à connexion ; sinon liste (date, titre, participants, coût) ; sélection → détail (Leaderboard) + « Télécharger PDF » (réutilise `downloadHostResultsPdf`). Lien depuis `/host`.

## Verification
- `node --test "src/**/*.test.js"` vert (history + rooms snapshot).
- `npx next build` : routes history présentes.
- Manuel : jouer un Examen connecté → le voir dans « Mes examens » → re-télécharger le PDF.

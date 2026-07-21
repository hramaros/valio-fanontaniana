import { getAccountByToken, isAdmin } from "./accounts.js";

// Cookie de session du formateur (côté serveur).
const COOKIE = "valio_session";

export function sessionTokenFromRequest(request) {
  const raw = request.headers.get("cookie") || "";
  const m = raw.match(/(?:^|;\s*)valio_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export async function accountFromRequest(request) {
  return getAccountByToken(sessionTokenFromRequest(request));
}

/**
 * Compte admin, ou `null`. C'est LA barrière de l'espace de pilotage : le
 * `role` renvoyé au navigateur ne sert qu'à l'affichage, chaque route
 * `/api/admin/*` doit repasser par ici et répondre 403 sinon.
 */
export async function adminFromRequest(request) {
  const account = await accountFromRequest(request);
  return isAdmin(account) ? account : null;
}

export function sessionSetCookie(token) {
  return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}`;
}

export function sessionClearCookie() {
  return `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

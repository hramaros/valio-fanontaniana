// Petit client fetch côté navigateur. Retourne { ok, status, data }.
//
// `fetch` lui-même peut lever (coupure réseau, DNS, requête annulée…), pas
// seulement renvoyer un statut d'erreur HTTP. Sans ce try/catch, l'exception
// remontait non gérée dans le composant appelant : un bouton pouvait rester
// bloqué en état « busy » sans jamais afficher de message d'erreur.
async function request(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, data: { error: "Connexion réseau impossible." } };
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

export const apiGet = (path) => request("GET", path);
export const apiPost = (path, body) => request("POST", path, body);
export const apiPatch = (path, body) => request("PATCH", path, body);
export const apiDelete = (path, body) => request("DELETE", path, body);

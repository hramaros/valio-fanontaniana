import { getOrCreateByEmail, createSession } from "@/lib/accounts";
import { sessionSetCookie } from "@/lib/authServer";

export const dynamic = "force-dynamic";

function redirect(origin, path) {
  return new Response(null, { status: 302, headers: { location: `${origin}${path}` } });
}

// Retour Google : vérifie le state, échange le code, ouvre une session.
export async function GET(request) {
  const url = new URL(request.url);
  const origin = url.origin;
  try {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const cookie = request.headers.get("cookie") || "";
    const m = cookie.match(/(?:^|;\s*)valio_oauth_state=([^;]+)/);
    const savedState = m ? m[1] : null;

    // CSRF : le state doit correspondre au cookie posé au départ.
    if (!code || !state || !savedState || state !== savedState)
      return redirect(origin, "/host?authError=google");

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret)
      return redirect(origin, "/host?authError=google_config");

    const redirectUri = `${origin}/api/auth/google/callback`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return redirect(origin, "/host?authError=google");
    const tokens = await tokenRes.json();

    const infoRes = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: { authorization: `Bearer ${tokens.access_token}` } },
    );
    if (!infoRes.ok) return redirect(origin, "/host?authError=google");
    const info = await infoRes.json();
    if (!info.email || info.email_verified === false)
      return redirect(origin, "/host?authError=google");

    const res = await getOrCreateByEmail({
      email: info.email,
      name: info.name,
      provider: "google",
    });
    if (!res.ok) return redirect(origin, "/host?authError=google");

    const token = await createSession(res.account.id);
    const headers = new Headers({ location: `${origin}/host` });
    headers.append("set-cookie", sessionSetCookie(token));
    headers.append(
      "set-cookie",
      "valio_oauth_state=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
    );
    return new Response(null, { status: 302, headers });
  } catch {
    return redirect(origin, "/host?authError=google");
  }
}

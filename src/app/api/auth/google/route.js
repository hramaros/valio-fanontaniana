import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

// Démarre le flux OAuth Google : redirige vers l'écran de consentement.
export async function GET(request) {
  const url = new URL(request.url);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return new Response(null, {
      status: 302,
      headers: { location: `${url.origin}/host?authError=google_config` },
    });
  }

  const redirectUri = `${url.origin}/api/auth/google/callback`;
  const state = randomBytes(16).toString("hex");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  const headers = new Headers({ location: authUrl.toString() });
  headers.append(
    "set-cookie",
    `valio_oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
  );
  return new Response(null, { status: 302, headers });
}

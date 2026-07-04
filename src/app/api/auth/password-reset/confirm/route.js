import {
  consumePasswordResetToken,
  setPassword,
  createSession,
  revokeOtherSessions,
  getAccountById,
} from "@/lib/accounts";
import { sessionSetCookie } from "@/lib/authServer";
import { readBody, json, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = handler(async (request) => {
  const { token, password, revokeOtherSessions: shouldRevokeOthers } = await readBody(request);

  const accountId = await consumePasswordResetToken(token);
  if (!accountId) return json({ error: "Lien invalide ou expiré." }, 400);

  const res = await setPassword(accountId, password);
  if (!res.ok) return json({ error: res.error }, res.status || 400);

  const newToken = await createSession(accountId);
  if (shouldRevokeOthers) await revokeOtherSessions(accountId, newToken);

  const account = await getAccountById(accountId);
  return new Response(JSON.stringify({ account }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": sessionSetCookie(newToken),
    },
  });
});

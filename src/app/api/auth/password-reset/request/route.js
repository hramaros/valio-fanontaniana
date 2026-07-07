import { getAccountByEmail, createPasswordResetToken } from "@/lib/accounts";
import { notify } from "@/lib/notify";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { readBody, json, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

// Délai plancher : la branche « compte existant » fait un aller-retour réseau
// supplémentaire (notify, jusqu'à ~3s) que la branche « inexistant » ne fait
// pas — sans ce plancher, la latence de réponse trahirait à elle seule si
// l'email correspond à un compte, contournant l'anti-énumération du corps
// de réponse identique ci-dessous.
const MIN_RESPONSE_MS = 300;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Anti-énumération : toujours la même réponse (et un temps de réponse
// minimum comparable), qu'un compte existe ou non.
export const POST = handler(async (request) => {
  if (!(await checkRateLimit("passwordReset", clientIp(request))))
    return json({ error: "Trop de tentatives, réessayez plus tard." }, 429);

  const start = Date.now();
  const { email } = await readBody(request);
  const account = await getAccountByEmail(email);
  if (account) {
    const token = await createPasswordResetToken(account.id);
    const origin = new URL(request.url).origin;
    const resetLink = `${origin}/reset-password?token=${token}`;
    await notify("password_reset", {
      email: account.email,
      name: account.name,
      resetLink,
      expiresInMinutes: 60,
    });
  }

  const elapsed = Date.now() - start;
  if (elapsed < MIN_RESPONSE_MS) await sleep(MIN_RESPONSE_MS - elapsed);
  return json({ ok: true });
});

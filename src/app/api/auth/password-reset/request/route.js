import { getAccountByEmail, createPasswordResetToken } from "@/lib/accounts";
import { notify } from "@/lib/notify";
import { readBody, json, handler } from "@/lib/http";

export const dynamic = "force-dynamic";

// Anti-énumération : toujours la même réponse, qu'un compte existe ou non.
export const POST = handler(async (request) => {
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
  return json({ ok: true });
});

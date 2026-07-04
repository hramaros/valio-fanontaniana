const DEFAULT_TIMEOUT_MS = 3000;

/**
 * Déclenche un événement de notification (email transactionnel) via le
 * webhook n8n générique. N'échoue jamais : les erreurs (réseau, timeout,
 * statut non-2xx, webhook non configuré) sont journalisées et avalées —
 * l'inscription, la connexion Google et le reset de mot de passe doivent
 * toujours réussir indépendamment du sort de l'email.
 *
 * `options.timeoutMs` est un override interne réservé aux tests ; en
 * production le timeout par défaut (3s) s'applique toujours.
 */
export async function notify(event, payload, options = {}) {
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) {
    console.error(`notify: N8N_WEBHOOK_URL non configurée, événement "${event}" ignoré.`);
    return;
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const secret = process.env.N8N_WEBHOOK_SECRET;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-valio-secret": secret } : {}),
      },
      body: JSON.stringify({ event, ...payload }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`notify: le webhook n8n a répondu ${res.status} pour l'événement "${event}".`);
    }
  } catch (err) {
    console.error(`notify: échec de l'envoi de l'événement "${event}" :`, err?.message || err);
  } finally {
    clearTimeout(timer);
  }
}

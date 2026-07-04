import { test } from "node:test";
import assert from "node:assert/strict";
import { notify } from "./notify.js";

function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    process.env[k] = vars[k];
  }
  return fn().finally(() => {
    for (const k of Object.keys(vars)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });
}

function withFetch(fakeFetch, fn) {
  const prev = globalThis.fetch;
  globalThis.fetch = fakeFetch;
  return fn().finally(() => {
    globalThis.fetch = prev;
  });
}

test("notify : POST vers N8N_WEBHOOK_URL avec event + payload + secret", async () => {
  let captured = null;
  await withFetch(
    async (url, opts) => {
      captured = { url, opts };
      return { ok: true };
    },
    () =>
      withEnv(
        { N8N_WEBHOOK_URL: "https://n8n.example.com/webhook/valio-notify", N8N_WEBHOOK_SECRET: "s3cr3t" },
        () => notify("account_created", { email: "p@e.mg", name: "Prof" }),
      ),
  );
  assert.equal(captured.url, "https://n8n.example.com/webhook/valio-notify");
  assert.equal(captured.opts.method, "POST");
  assert.equal(captured.opts.headers["x-valio-secret"], "s3cr3t");
  assert.equal(captured.opts.headers["content-type"], "application/json");
  const body = JSON.parse(captured.opts.body);
  assert.deepEqual(body, { event: "account_created", email: "p@e.mg", name: "Prof" });
});

test("notify : n'échoue jamais si fetch rejette (erreur réseau)", async () => {
  await withFetch(
    async () => {
      throw new Error("network down");
    },
    () =>
      withEnv({ N8N_WEBHOOK_URL: "https://n8n.example.com/webhook/x" }, () =>
        assert.doesNotReject(notify("password_reset", { email: "a@b.mg" })),
      ),
  );
});

test("notify : n'attend pas indéfiniment si l'appel est trop lent (timeout)", async () => {
  await withFetch(
    (url, opts) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      }),
    () =>
      withEnv({ N8N_WEBHOOK_URL: "https://n8n.example.com/webhook/x" }, async () => {
        const start = Date.now();
        await notify("account_created", { email: "a@b.mg" }, { timeoutMs: 50 });
        assert.ok(Date.now() - start < 500, "doit s'arrêter peu après le timeout, pas attendre indéfiniment");
      }),
  );
});

test("notify : sans N8N_WEBHOOK_URL configurée, ne tente aucun appel et ne lève pas", async () => {
  let called = false;
  await withFetch(
    async () => {
      called = true;
      return { ok: true };
    },
    () => withEnv({ N8N_WEBHOOK_URL: "" }, () => notify("account_created", { email: "a@b.mg" })),
  );
  assert.equal(called, false);
});

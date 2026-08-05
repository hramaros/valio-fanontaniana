import { test } from "node:test";
import assert from "node:assert/strict";
import { marketingUrl } from "./marketing.js";

// L'URL par défaut est celle de la vitrine (aucun NEXT_PUBLIC_MARKETING_URL en test).
test("marketingUrl : accueil tagué UTM", () => {
  const url = marketingUrl("result");
  assert.match(url, /^https:\/\/valio-fanontaniana\.mg\?/);
  assert.match(url, /utm_source=app/);
  assert.match(url, /utm_medium=referral/);
  assert.match(url, /utm_content=result/);
});

test("marketingUrl : chemin interne", () => {
  assert.match(marketingUrl("home", "/tarifs"), /valio-fanontaniana\.mg\/tarifs\?utm_source=app/);
});

test("marketingUrl : chemin sans slash initial", () => {
  assert.match(marketingUrl("home", "tarifs"), /\/tarifs\?/);
});

test("marketingUrl : sans source, aucun paramètre", () => {
  assert.equal(marketingUrl(""), "https://valio-fanontaniana.mg");
});

test("marketingUrl : source échappée", () => {
  assert.match(marketingUrl("a b&c"), /utm_content=a%20b%26c/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { adminEmailList, isConfiguredAdmin } from "./adminEmails.js";

// Restaure ADMIN_EMAILS autour de chaque cas : ces tests écrivent dans
// process.env, il ne faut pas que ça fuie d'un test à l'autre.
function withEnv(value, fn) {
  const prev = process.env.ADMIN_EMAILS;
  if (value === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = prev;
  }
}

test("liste vide ou absente = personne n'est admin (fail-closed)", () => {
  withEnv(undefined, () => {
    assert.deepEqual(adminEmailList(), []);
    assert.equal(isConfiguredAdmin("chef@valio.mg"), false);
  });
  withEnv("", () => assert.equal(isConfiguredAdmin("chef@valio.mg"), false));
  withEnv("   ", () => assert.equal(isConfiguredAdmin("chef@valio.mg"), false));
  withEnv(" , ,, ", () => {
    assert.deepEqual(adminEmailList(), [], "que des vides");
    assert.equal(isConfiguredAdmin("chef@valio.mg"), false);
  });
});

test("comparaison insensible à la casse et aux espaces", () => {
  withEnv("  Chef@Valio.MG  ", () => {
    assert.deepEqual(adminEmailList(), ["chef@valio.mg"]);
    assert.equal(isConfiguredAdmin("CHEF@valio.mg"), true);
    assert.equal(isConfiguredAdmin("chef@valio.mg"), true);
  });
});

test("plusieurs emails séparés par des virgules", () => {
  withEnv("a@x.mg, b@x.mg ,c@x.mg", () => {
    assert.deepEqual(adminEmailList(), ["a@x.mg", "b@x.mg", "c@x.mg"]);
    assert.equal(isConfiguredAdmin("b@x.mg"), true);
    assert.equal(isConfiguredAdmin("d@x.mg"), false);
  });
});

test("un email vide n'est jamais admin, même si la liste en contient", () => {
  withEnv("a@x.mg", () => {
    assert.equal(isConfiguredAdmin(""), false);
    assert.equal(isConfiguredAdmin(null), false);
    assert.equal(isConfiguredAdmin(undefined), false);
  });
});

test("relit l'environnement à chaque appel (pas figé au chargement)", () => {
  withEnv("first@x.mg", () => {
    assert.equal(isConfiguredAdmin("first@x.mg"), true);
    process.env.ADMIN_EMAILS = "second@x.mg";
    assert.equal(isConfiguredAdmin("first@x.mg"), false, "changement pris en compte");
    assert.equal(isConfiguredAdmin("second@x.mg"), true);
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateVerifyCode, normalizeVerifyCode } from "./code.js";

test("generateVerifyCode : format VF-XXXX-XXXX, alphabet non ambigu", () => {
  for (let i = 0; i < 50; i++) {
    const code = generateVerifyCode();
    assert.match(code, /^VF-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
  }
});

test("normalizeVerifyCode : saisies approximatives vers la forme canonique", () => {
  assert.equal(normalizeVerifyCode("VF-7KM4-Q2XR"), "VF-7KM4-Q2XR");
  assert.equal(normalizeVerifyCode("vf-7km4-q2xr"), "VF-7KM4-Q2XR");
  assert.equal(normalizeVerifyCode("7KM4Q2XR"), "VF-7KM4-Q2XR"); // sans préfixe
  assert.equal(normalizeVerifyCode(" vf 7km4 q2xr "), "VF-7KM4-Q2XR");
  assert.equal(normalizeVerifyCode("VF7KM4Q2XR"), "VF-7KM4-Q2XR");
});

test("normalizeVerifyCode : corps commençant par VF (préfixe non retiré à tort)", () => {
  // Code réel VF-VFAB-CDEF saisi sans préfixe : « VFABCDEF » (8 caractères).
  assert.equal(normalizeVerifyCode("VFABCDEF"), "VF-VFAB-CDEF");
  // Le même avec préfixe : 10 caractères, le préfixe est retiré.
  assert.equal(normalizeVerifyCode("VFVFABCDEF"), "VF-VFAB-CDEF");
});

test("normalizeVerifyCode : saisies invalides → null", () => {
  assert.equal(normalizeVerifyCode(""), null);
  assert.equal(normalizeVerifyCode(null), null);
  assert.equal(normalizeVerifyCode("VF-7KM4"), null); // trop court
  assert.equal(normalizeVerifyCode("VF-7KM4-Q2XR-EXTRA"), null); // trop long
});

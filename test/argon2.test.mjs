import { test } from "node:test";
import assert from "node:assert/strict";
import { initArgon2, argon2Hash } from "../src/pow/argon2.mjs";
import { getDifficultyMask, maskValid } from "../src/pow/difficulty.mjs";

// live ephemery argon2 params
const params = { a: "argon2", t: 0, v: 13, i: 4, m: 4096, p: 1, l: 16 };

test("argon2 wasm loads, hashes, restores Date.now", async () => {
  await initArgon2();
  assert.ok(Date.now() > 1700000000000, `Date.now should be wall-clock, got ${Date.now()}`);
  const h = argon2Hash("0000000000000001", "11".repeat(16), params);
  assert.equal(typeof h, "string");
  assert.ok(/^[0-9a-f]+$/.test(h), `expected hex hash, got ${h}`);
  assert.equal(h.length, params.l * 2); // hashlen=16 bytes -> 32 hex
});

test("argon2 finds a valid share within a nonce range", async () => {
  await initArgon2();
  const dmask = getDifficultyMask(8);
  let found = false;
  for (let n = 1; n <= 4000 && !found; n++) {
    const nonceHex = n.toString(16).padStart(16, "0");
    if (maskValid(argon2Hash(nonceHex, "22".repeat(16), params), dmask)) found = true;
  }
  assert.ok(found, "expected at least one diff-8 share in 4000 argon2 hashes");
});

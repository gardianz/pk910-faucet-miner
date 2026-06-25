import { test } from "node:test";
import assert from "node:assert/strict";
import { initNickminer, setConfig, run, isValidShare } from "../src/nickminer.mjs";
import { nonceHex } from "../src/powParams.mjs";

const params = { a: "nickminer", i: "f4f3d96484a7555bb0c87d329b73617977ca3ae37c5e6876c44dead410fd074a", r: "0539", v: 27, c: 100, s: "008282", p: "000000" };

test("isValidShare checks first hash byte vs difficulty", () => {
  assert.equal(isValidShare("0x0d" + "ab".repeat(20), 13), true);   // 0x0d = 13
  assert.equal(isValidShare("0x0c" + "ab".repeat(20), 13), false);  // 0x0c = 12
  assert.equal(isValidShare("not-a-hash", 13), false);
  assert.equal(isValidShare("", 13), false);
});

test("run returns a 0x hash for sequential nonces", async () => {
  await initNickminer();
  setConfig(params, "11".repeat(32));
  for (let n = 1; n <= 5; n++) {
    const h = run(nonceHex(n));
    assert.ok(typeof h === "string" && h.startsWith("0x"), `nonce ${n} -> ${h}`);
  }
});

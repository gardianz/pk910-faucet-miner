import { test } from "node:test";
import assert from "node:assert/strict";
import { getDifficultyMask, maskValid } from "../src/pow/difficulty.mjs";

test("getDifficultyMask matches PoWWorker for diff 8", () => {
  assert.equal(getDifficultyMask(8), "0100");
});

test("getDifficultyMask for diff 13", () => {
  assert.equal(getDifficultyMask(13), "0008");
});

test("maskValid compares leading hex", () => {
  const dmask = getDifficultyMask(8); // "0100"
  assert.equal(maskValid("0099" + "ab".repeat(6), dmask), true);   // 0099 <= 0100
  assert.equal(maskValid("0100" + "ab".repeat(6), dmask), true);   // equal
  assert.equal(maskValid("0101" + "ab".repeat(6), dmask), false);  // 0101 > 0100
  assert.equal(maskValid("", dmask), false);
});

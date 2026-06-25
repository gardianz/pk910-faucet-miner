import { test } from "node:test";
import assert from "node:assert/strict";
import { nextNonceBudget } from "../src/miner.mjs";

test("nonce budget respects hashrate limit", () => {
  const start = 1000; // sec
  const now = (start + 10) * 1000; // 10s later, ms
  // allowed ~ (10+4)*1000 - lastNonce
  assert.equal(nextNonceBudget(start, 0, 1000, now), 14000);
  assert.equal(nextNonceBudget(start, 13990, 1000, now), 10);
  assert.equal(nextNonceBudget(start, 999999, 1000, now), 0); // already ahead
});

test("no limit when hashrateLimit <= 0", () => {
  assert.equal(nextNonceBudget(1000, 0, 0, 2000), Infinity);
});

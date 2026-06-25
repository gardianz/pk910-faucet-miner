import { test } from "node:test";
import assert from "node:assert/strict";
import { nextNonceBudget, computeThreshold } from "../src/miner.mjs";

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

test("computeThreshold: default = minClaim", () => {
  assert.equal(computeThreshold({}, "100", "1000"), 100n);
});

test("computeThreshold: absolute wei, clamped to [min,max]", () => {
  assert.equal(computeThreshold({ claimThresholdWei: 500n }, "100", "1000"), 500n);
  assert.equal(computeThreshold({ claimThresholdWei: 5000n }, "100", "1000"), 1000n); // > max
  assert.equal(computeThreshold({ claimThresholdWei: 10n }, "100", "1000"), 100n);    // < min
});

test("computeThreshold: percent of maxClaim", () => {
  assert.equal(computeThreshold({ claimPercent: 50 }, "100", "1000"), 500n);
  assert.equal(computeThreshold({ claimPercent: 100 }, "100", "1000"), 1000n);
  assert.equal(computeThreshold({ claimPercent: 5 }, "100", "1000"), 100n); // 50 -> clamp up to min
});

test("computeThreshold: absolute wins over percent", () => {
  assert.equal(computeThreshold({ claimThresholdWei: 300n, claimPercent: 90 }, "100", "1000"), 300n);
});

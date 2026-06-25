import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const wasmPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../libs/nickminer_wasm.cjs");

test("nickminer wasm loads and runs in Node", async () => {
  const mod = require(wasmPath);
  await mod.getNickMinerReadyPromise();
  const miner = mod.getNickMiner();
  miner.miner_init();
  // live params; preimage = any 32-byte hex
  miner.miner_set_config(
    "f4f3d96484a7555bb0c87d329b73617977ca3ae37c5e6876c44dead410fd074a",
    "0539", 27, "008282", "000000", 100,
    "00".repeat(32)
  );
  const hash = miner.miner_run("0000000000000001");
  assert.equal(typeof hash, "string");
  assert.ok(hash.startsWith("0x"), `expected 0x-hash, got ${hash}`);
});

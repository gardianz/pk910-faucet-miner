import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const wasmPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../libs/nickminer_wasm.cjs");

// The nickminer Emscripten runtime overwrites the global Date.now (it returns ms
// since module init, not wall-clock). Capture the real one before loading so we
// can restore it — the rest of the app (e.g. hashrate pacing) relies on Date.now.
const realDateNow = Date.now.bind(Date);

let miner = null;

export async function initNickminer() {
  const mod = require(wasmPath);
  await mod.getNickMinerReadyPromise();
  miner = mod.getNickMiner();
  miner.miner_init();
  Date.now = realDateNow; // undo the Emscripten clobber
}

// params: { i, r, v, c, s, p }  (from faucet config powParams)
export function setConfig(params, preimageHexStr) {
  if (!miner) throw new Error("nickminer not initialized");
  miner.miner_set_config(params.i, params.r, params.v, params.s, params.p, params.c, preimageHexStr);
}

export function run(nonceHexStr) {
  return miner.miner_run(nonceHexStr);
}

// mirrors PoWWorker.checkHash nickminer branch
export function isValidShare(hash, difficulty) {
  if (typeof hash !== "string" || !hash.startsWith("0x") || hash.length < 4) return false;
  const got = parseInt(hash.slice(2, 4), 16);
  return Number.isFinite(got) && got >= difficulty;
}

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const wasmPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../libs/argon2_wasm.cjs");

// Emscripten runtime clobbers global Date.now (see nickminer.mjs); capture + restore.
const realDateNow = Date.now.bind(Date);

let argon2 = null;

export async function initArgon2() {
  const mod = require(wasmPath);
  await mod.getArgon2ReadyPromise();
  argon2 = mod.getArgon2();
  Date.now = realDateNow;
}

// params: { t, v, i, m, p, l }  (from faucet config powParams, argon2 branch)
// mirrors worker-argon2: argon2(nonce, preimg, hashlen=l, iterations=i, memory=m, parallelism=p, type=t, version=v)
export function argon2Hash(nonceHex, preimgHex, params) {
  if (!argon2) throw new Error("argon2 not initialized");
  return argon2(nonceHex, preimgHex, params.l, params.i, params.m, params.p, params.t, params.v);
}

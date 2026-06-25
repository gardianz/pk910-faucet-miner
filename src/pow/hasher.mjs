import * as nm from "../nickminer.mjs";
import { initArgon2, argon2Hash } from "./argon2.mjs";
import { getDifficultyMask, maskValid } from "./difficulty.mjs";

// Returns a uniform hasher for a faucet's pow config, hiding per-algo differences:
//   configure(preimgHex)            - set the mining preimage
//   hashShare(nonceHex) -> {valid, data}  - hash one nonce, is it a share, and its submit `data`
//   verify(preimgHex, nonceHex, data) -> bool - validate a peer's share (for the WS verify task)
//
// nickminer: stateful wasm (set_config + run), valid = first hash byte >= difficulty, data = hash.
// argon2:    stateless wasm, valid = leading hex <= difficulty mask, data = null.
export async function createHasher(params, difficulty) {
  if (params.a === "nickminer") {
    await nm.initNickminer();
    let preHex = null;
    return {
      algo: "nickminer",
      configure(preimgHex) { preHex = preimgHex; nm.setConfig(params, preimgHex); },
      hashShare(nonceHex) {
        const h = nm.run(nonceHex);
        return { valid: nm.isValidShare(h, difficulty), data: h };
      },
      verify(preimgHex, nonceHex, data) {
        nm.setConfig(params, preimgHex);
        const h = nm.run(nonceHex);
        nm.setConfig(params, preHex); // restore mining preimage
        return h === data;
      },
    };
  }
  if (params.a === "argon2") {
    await initArgon2();
    const dmask = getDifficultyMask(difficulty);
    let preHex = null;
    return {
      algo: "argon2",
      configure(preimgHex) { preHex = preimgHex; },
      hashShare(nonceHex) {
        const h = argon2Hash(nonceHex, preHex, params);
        return { valid: maskValid(h, dmask), data: null };
      },
      verify(preimgHex, nonceHex) {
        return maskValid(argon2Hash(nonceHex, preimgHex, params), dmask);
      },
    };
  }
  throw new Error(`unsupported pow algo: ${params.a}`);
}

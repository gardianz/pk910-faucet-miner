// Mirrors pk910 faucet-client getPoWParamsStr (nickminer branch) + worker nonce/preimage encoding.
export function getPoWParamsStr(params, difficulty) {
  return [params.a, params.i, params.r, params.v, params.c, params.s, params.p, difficulty].join("|");
}

export function preimageHex(b64) {
  return Buffer.from(b64, "base64").toString("hex");
}

export function nonceHex(nonce) {
  let h = nonce.toString(16);
  if (h.length < 16) h = "0".repeat(16 - h.length) + h;
  return h;
}

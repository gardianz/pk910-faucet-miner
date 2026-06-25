// Mirrors pk910 faucet-client getPoWParamsStr (all algo branches) + worker nonce/preimage encoding.
export function getPoWParamsStr(params, difficulty) {
  const p = params;
  switch (p.a) {
    case "nickminer":   return [p.a, p.i, p.r, p.v, p.c, p.s, p.p, difficulty].join("|");
    case "argon2":      return [p.a, p.t, p.v, p.i, p.m, p.p, p.l, difficulty].join("|");
    case "scrypt":      return [p.a, p.n, p.r, p.p, p.l, difficulty].join("|");
    case "cryptonight": return [p.a, p.c, p.v, p.h, difficulty].join("|");
    default: throw new Error(`unknown pow algo: ${p.a}`);
  }
}

export function preimageHex(b64) {
  return Buffer.from(b64, "base64").toString("hex");
}

export function nonceHex(nonce) {
  let h = nonce.toString(16);
  if (h.length < 16) h = "0".repeat(16 - h.length) + h;
  return h;
}

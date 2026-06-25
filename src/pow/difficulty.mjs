// Mirrors pk910 PoWWorker.getDifficultyMask + the non-nickminer hash check.
// For mask-based algos (scrypt/cryptonight/argon2) a share is valid when the
// leading hex of the hash is lexicographically <= the difficulty mask.
export function getDifficultyMask(difficulty) {
  const byteCount = Math.floor(difficulty / 8) + 1;
  const bitCount = difficulty - (byteCount - 1) * 8;
  const maxValue = Math.pow(2, 8 - bitCount);
  let mask = maxValue.toString(16);
  while (mask.length < byteCount * 2) mask = "0" + mask;
  return mask;
}

export function maskValid(hashHex, dmask) {
  if (typeof hashHex !== "string" || hashHex.length < dmask.length) return false;
  return hashHex.substring(0, dmask.length) <= dmask;
}

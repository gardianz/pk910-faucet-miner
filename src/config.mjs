import "dotenv/config";

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

const DEFAULT_FAUCET_URLS = {
  sepolia: "https://sepolia-faucet.pk910.de",
  ephemery: "https://ephemery-faucet.pk910.de",
  hoodi: "https://hoodi-faucet.pk910.de",
};

export function loadConfig(env = process.env) {
  const cliver = env.FAUCET_CLIVER || "2.4.0";

  // which faucet(s) to run — comma separated (e.g. "sepolia,ephemery,hoodi")
  const names = (env.FAUCETS || "sepolia")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (names.length === 0) throw new Error("no faucets selected (set FAUCETS)");
  const faucets = names.map((name) => {
    const url = (env[`${name.toUpperCase()}_URL`] || DEFAULT_FAUCET_URLS[name] || "").replace(/\/$/, "");
    if (!url) throw new Error(`no URL for faucet "${name}" (set ${name.toUpperCase()}_URL)`);
    return { name, url, wsUrl: url.replace(/^http/, "ws") + "/ws/pow", cliver };
  });

  const multibotApikey = env.MULTIBOT_APIKEY;
  if (!multibotApikey) throw new Error("MULTIBOT_APIKEY is required");

  const claimThresholdWei = env.CLAIM_THRESHOLD_WEI ? BigInt(env.CLAIM_THRESHOLD_WEI) : null;

  // alternative to an absolute threshold: mine until balance reaches this % of the faucet's maxClaim
  const claimPercent = env.CLAIM_PERCENT ? Number(env.CLAIM_PERCENT) : null;
  if (claimPercent != null && (!Number.isFinite(claimPercent) || claimPercent <= 0 || claimPercent > 100))
    throw new Error("CLAIM_PERCENT must be a number between 1 and 100");

  const wallets = [];
  for (let i = 1; i <= 3; i++) {
    const addr = env[`WALLET_${i}_ADDR`];
    if (!addr) continue;
    if (!ADDR_RE.test(addr)) throw new Error(`WALLET_${i}_ADDR is not a valid ETH address: ${addr}`);
    wallets.push({ addr, proxy: env[`WALLET_${i}_PROXY`] || undefined });
  }
  if (wallets.length === 0) throw new Error("no wallets configured (set WALLET_1_ADDR..WALLET_3_ADDR)");

  return { faucets, cliver, multibotApikey, claimThresholdWei, claimPercent, wallets };
}

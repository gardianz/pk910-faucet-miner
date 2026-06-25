import "dotenv/config";

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

export function loadConfig(env = process.env) {
  const faucetUrl = (env.FAUCET_URL || "https://sepolia-faucet.pk910.de").replace(/\/$/, "");
  const wsUrl = faucetUrl.replace(/^http/, "ws") + "/ws/pow";
  const cliver = env.FAUCET_CLIVER || "2.4.0";

  const multibotApikey = env.MULTIBOT_APIKEY;
  if (!multibotApikey) throw new Error("MULTIBOT_APIKEY is required");

  const claimThresholdWei = env.CLAIM_THRESHOLD_WEI ? BigInt(env.CLAIM_THRESHOLD_WEI) : null;

  const wallets = [];
  for (let i = 1; i <= 3; i++) {
    const addr = env[`WALLET_${i}_ADDR`];
    if (!addr) continue;
    if (!ADDR_RE.test(addr)) throw new Error(`WALLET_${i}_ADDR is not a valid ETH address: ${addr}`);
    wallets.push({ addr, proxy: env[`WALLET_${i}_PROXY`] || undefined });
  }
  if (wallets.length === 0) throw new Error("no wallets configured (set WALLET_1_ADDR..WALLET_3_ADDR)");

  return { faucetUrl, wsUrl, cliver, multibotApikey, claimThresholdWei, wallets };
}

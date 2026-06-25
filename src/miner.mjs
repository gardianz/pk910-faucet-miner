import { createHasher } from "./pow/hasher.mjs";
import { getPoWParamsStr, preimageHex, nonceHex } from "./powParams.mjs";
import { WsClient } from "./wsClient.mjs";
import { startSessionViaBrowser } from "./captchaBrowser.mjs";

// mirrors PoWMiner.getLimitedNonceRefillCount: allowed nonces ≈ (age+4)*limit - lastNonce
export function nextNonceBudget(sessionStartSec, lastNonce, hashrateLimit, now = Date.now()) {
  if (hashrateLimit <= 0) return Infinity;
  const age = Math.floor(now / 1000) - sessionStartSec + 4;
  const budget = age * hashrateLimit - lastNonce;
  return budget > 0 ? budget : 0;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function mineWallet({ wallet, faucet, cfg, api, solver, log = console }) {
  const faucetConfig = await api.getFaucetConfig(wallet.proxy);
  const pow = faucetConfig.modules.pow;
  let params = pow.powParams;
  let difficulty = pow.powDifficulty;
  let hashrateLimit = pow.powHashrateLimit || 0;
  let paramsStr = getPoWParamsStr(params, difficulty);
  // default: claim as soon as eligible (minClaim); maxClaim differs wildly per faucet
  const threshold = cfg.claimThresholdWei ?? BigInt(faucetConfig.minClaim);
  const tag = `${faucet.name}:${wallet.addr}`;

  log.info?.(`[${tag}] starting captcha + session (algo=${params.a} diff=${difficulty})`);
  const sessionInfo = await startSessionViaBrowser({
    faucetUrl: faucet.url, addr: wallet.addr, proxy: wallet.proxy, solver,
  });
  const sessionId = sessionInfo.session;
  const startSec = sessionInfo.start;
  const preImage = sessionInfo.modules?.pow?.preImage;
  if (!preImage) throw new Error("session has no pow preImage");
  const preHex = preimageHex(preImage);

  let hasher = await createHasher(params, difficulty);
  hasher.configure(preHex);

  const ws = new WsClient({ wsUrl: faucet.wsUrl, sessionId, cliver: faucet.cliver, proxy: wallet.proxy });
  let balance = BigInt(sessionInfo.balance || "0");
  let lastNonce = (sessionInfo.modules?.pow?.lastNonce ?? 0) + 1;

  ws.on("updateBalance", (m) => {
    balance = BigInt(m.data.balance);
    log.info?.(`[${tag}] balance=${balance} (${m.data.reason})`);
  });
  ws.on("verify", (m) => {
    // validate a peer's share with the verification preimage (hasher restores mining state)
    const isValid = hasher.verify(preimageHex(m.data.preimage), nonceHex(m.data.nonce), m.data.data);
    ws.sendRequest("verifyResult", { shareId: m.data.shareId, params: paramsStr, isValid }).catch(() => {});
  });
  ws.on("error", (m) => log.warn?.(`[${tag}] ws error ${m.data?.code}: ${m.data?.message}`));

  await ws.connect();

  let invalidShareStreak = 0;
  let refreshing = false;
  const REJECT_LIMIT = 10;
  const onShareError = async (err) => {
    log.warn?.(`[${tag}] share rejected: ${err.message}`);
    if (!/INVALID_SHARE|Invalid share params/i.test(err.message)) return;
    invalidShareStreak++;
    if (invalidShareStreak < REJECT_LIMIT || refreshing) return;
    refreshing = true;
    try {
      const fc = await api.getFaucetConfig(wallet.proxy);
      const np = fc.modules.pow;
      params = np.powParams;
      difficulty = np.powDifficulty;
      hashrateLimit = np.powHashrateLimit || 0;
      paramsStr = getPoWParamsStr(params, difficulty);
      hasher = await createHasher(params, difficulty);
      hasher.configure(preHex);
      invalidShareStreak = 0;
      log.info?.(`[${tag}] refreshed powParams after ${REJECT_LIMIT} INVALID_SHARE`);
    } catch (e) {
      log.warn?.(`[${tag}] config refresh failed: ${e.message}`);
    } finally {
      refreshing = false;
    }
  };

  // mining loop, paced to hashrate limit, until threshold reached
  while (balance < threshold) {
    const budget = nextNonceBudget(startSec, lastNonce, hashrateLimit);
    if (budget <= 0) { await sleep(1000); continue; }
    const batch = Math.min(budget, 1000);
    for (let k = 0; k < batch; k++) {
      const { valid, data } = hasher.hashShare(nonceHex(lastNonce));
      if (valid) {
        ws.sendRequest("foundShare", { nonce: lastNonce, data, params: paramsStr, hashrate: hashrateLimit })
          .then(() => { invalidShareStreak = 0; })
          .catch((err) => onShareError(err));
      }
      lastNonce++;
    }
    await sleep(1000); // 1 batch/sec keeps us within hashrateLimit
  }

  log.info?.(`[${tag}] threshold reached (${balance}); closing + claiming`);
  await ws.sendRequest("closeSession").catch(() => {});
  ws.close();

  await api.claimReward(sessionId, wallet.proxy);
  let claimHash = null;
  for (let i = 0; i < 60; i++) {
    const st = await api.getSessionStatus(sessionId, wallet.proxy);
    if (st.claimHash) { claimHash = st.claimHash; break; }
    if (st.claimStatus === "failed" || st.status === "failed") throw new Error(`claim failed: ${st.failedReason || st.claimMessage}`);
    await sleep(5000);
  }
  return { status: "done", faucet: faucet.name, sessionId, balance: balance.toString(), claimHash };
}

import { loadConfig } from "./config.mjs";
import { FaucetApi } from "./faucetApi.mjs";
import { CaptchaSolver } from "./captchaSolver.mjs";
import { mineWallet } from "./miner.mjs";

const log = {
  info: (...a) => console.log(new Date().toISOString(), ...a),
  warn: (...a) => console.warn(new Date().toISOString(), ...a),
};

async function main() {
  const cfg = loadConfig();
  const api = new FaucetApi(cfg.faucetUrl, cfg.cliver);
  const solver = new CaptchaSolver(cfg.multibotApikey);

  log.info(`multibot balance: ${await solver.balance().catch((e) => e.message)}`);

  for (const wallet of cfg.wallets) {
    try {
      const res = await mineWallet({ wallet, cfg, api, solver, log });
      log.info(`[${wallet.addr}] DONE claimHash=${res.claimHash} balance=${res.balance}`);
    } catch (err) {
      log.warn(`[${wallet.addr}] FAILED: ${err.message}`); // isolate: continue with next wallet
    }
  }
  log.info("all wallets processed");
}

main().catch((err) => { console.error(err); process.exit(1); });

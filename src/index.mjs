import { setGlobalDispatcher, Agent } from "undici";
import { loadConfig } from "./config.mjs";
import { FaucetApi } from "./faucetApi.mjs";
import { CaptchaSolver } from "./captchaSolver.mjs";
import { mineWallet } from "./miner.mjs";

// Force IPv4 for all HTTP. multibot/faucet hosts publish AAAA (IPv6) records that are
// unreachable from many networks; Node's happy-eyeballs then intermittently ETIMEDOUTs,
// which showed up as captcha solves "hanging" for the full timeout. (curl -4 = 100% ok.)
setGlobalDispatcher(new Agent({ connect: { family: 4 } }));

const log = {
  info: (...a) => console.log(new Date().toISOString(), ...a),
  warn: (...a) => console.warn(new Date().toISOString(), ...a),
};

async function main() {
  const cfg = loadConfig();
  const solver = new CaptchaSolver(cfg.captchaApikey, undefined, { provider: cfg.captchaProvider });

  log.info(`faucets: ${cfg.faucets.map((f) => f.name).join(", ")} | wallets: ${cfg.wallets.length}`);
  log.info(`captcha: ${cfg.captchaProvider} | balance: ${await solver.balance().catch((e) => e.message)}`);

  for (const faucet of cfg.faucets) {
    const api = new FaucetApi(faucet.url, faucet.cliver);
    for (const wallet of cfg.wallets) {
      const tag = `${faucet.name}:${wallet.addr}`;
      try {
        const res = await mineWallet({ wallet, faucet, cfg, api, solver, log });
        log.info(`[${tag}] DONE claimHash=${res.claimHash} balance=${res.balance}`);
      } catch (err) {
        log.warn(`[${tag}] FAILED: ${err.message}`); // isolate: continue with next wallet/faucet
      }
    }
  }
  log.info("all faucets/wallets processed");
}

main().catch((err) => { console.error(err); process.exit(1); });

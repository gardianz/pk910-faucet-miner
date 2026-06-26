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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runRound(cfg, solver) {
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
}

async function main() {
  const cfg = loadConfig();
  const solver = new CaptchaSolver(cfg.captchaApikey, undefined, { provider: cfg.captchaProvider });

  log.info(`faucets: ${cfg.faucets.map((f) => f.name).join(", ")} | wallets: ${cfg.wallets.length}` +
    ` | loop: ${cfg.loopForever ? `forever (delay ${cfg.loopDelaySec}s)` : "once"}`);

  let round = 0;
  do {
    round++;
    log.info(`=== round ${round} === captcha: ${cfg.captchaProvider} | balance: ${await solver.balance().catch((e) => e.message)}`);
    try {
      await runRound(cfg, solver);
    } catch (err) {
      log.warn(`round ${round} aborted: ${err.message}`); // never let one round kill the 24/7 loop
    }
    if (cfg.loopForever) {
      log.info(`round ${round} done; sleeping ${cfg.loopDelaySec}s before next round`);
      await sleep(cfg.loopDelaySec * 1000);
    }
  } while (cfg.loopForever);
  log.info("all faucets/wallets processed");
}

main().catch((err) => { console.error(err); process.exit(1); });

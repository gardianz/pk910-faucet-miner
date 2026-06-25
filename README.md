# Sepolia PoW Faucet Miner

Mines the pk910 Sepolia PoW faucet for up to 3 own addresses (native WS + reused nickminer WASM),
solving the start captcha via a short-lived headless browser + multibot.

## Setup
```bash
npm install && npx playwright install chromium
cp .env.example .env   # fill WALLET_*_ADDR, MULTIBOT_APIKEY, optional WALLET_*_PROXY
npm test               # unit tests
npm start              # run miner over all configured wallets
```

## Notes
- Rotate any multibot API key that has been shared in plaintext.
- Reward goes to `WALLET_n_ADDR`; no private keys are needed or stored.
- Captcha is brittle by design (pk910 obfuscates + rotates providers). If a run fails at the
  captcha step, re-run `test/captchaBrowser.manual.md` with `headless:false` and adjust selectors.

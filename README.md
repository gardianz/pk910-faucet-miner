# pk910 PoW Faucet Miner (Sepolia / Ephemery / Hoodi)

Mines pk910 PoW faucets for up to 3 own addresses (native WS + reused PoW WASM),
solving the start captcha via a short-lived headless browser + multibot.

## Supported faucets
Pick any one, two, or all three via `FAUCETS` in `.env` (comma separated).

| Faucet   | PoW algo  | Captcha          | minClaim |
|----------|-----------|------------------|----------|
| sepolia  | nickminer | custom (rotates) | 0.05     |
| ephemery | argon2    | hCaptcha         | 1.0      |
| hoodi    | nickminer | custom (rotates) | 0.1      |

PoW params / difficulty / captcha provider are read live per faucet from `getFaucetConfig`,
so the miner adapts automatically. Default claim threshold = each faucet's `minClaim`
(override globally with `CLAIM_THRESHOLD_WEI`).

## Setup
```bash
npm install && npx playwright install chromium
cp .env.example .env   # set FAUCETS, WALLET_*_ADDR, MULTIBOT_APIKEY, optional WALLET_*_PROXY
npm test               # unit tests
FAUCETS=sepolia,ephemery,hoodi npm start   # run selected faucets x wallets
```

## Notes
- Rotate any multibot API key that has been shared in plaintext.
- Reward goes to `WALLET_n_ADDR`; no private keys are needed or stored.
- Captcha is brittle by design (pk910 obfuscates + rotates providers). If a run fails at the
  captcha step, re-run `test/captchaBrowser.manual.md` with `headless:false` and adjust selectors.

## Live run notes (validated end-to-end)
The full flow was validated live: reCAPTCHA v2 solved via multibot → session → nickminer
mining → shares accepted → verify → balance → claim (real Sepolia tx). Current faucet provider
is reCAPTCHA v2 (`userrecaptcha`, key param `googlekey`); the bot also handles hCaptcha/Turnstile
if pk910 rotates.

### Headless Chromium system libraries
Playwright Chromium needs system libs (`libnspr4.so`, `libnss3.so`, `libasound.so.2`, …). If you
see `error while loading shared libraries`, either install them:
```bash
sudo npx playwright install-deps chromium      # Debian/Ubuntu/WSL, needs root
```
or, without root, point `LD_LIBRARY_PATH` at an extracted copy of the libs:
```bash
LD_LIBRARY_PATH=/path/to/chrome-libs/usr/lib/x86_64-linux-gnu npm start
```
The browser is launched with `--no-sandbox` (required in WSL/containers/CI).

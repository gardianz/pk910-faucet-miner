# Sepolia PoW Faucet Miner — Design Spec

**Tanggal:** 2026-06-25
**Target faucet:** https://sepolia-faucet.pk910.de/ (pk910 PoWFaucet v2.4.0, Sepolia testnet)
**Scope:** Bot mining PoW untuk **3 wallet milik sendiri**, mining headless (native WS + wasm), captcha via hybrid browser+solver.

---

## 1. Tujuan & Batasan

**Tujuan:** Otomasi kerja mining PoW (mekanisme resmi faucet) untuk 3 address milik user, sampai balance ≥ threshold lalu auto-claim ke address.

**Batasan (sengaja, anti-abuse):**
- Hanya 3 wallet dari config — TIDAK ada generator address massal.
- Proxy = 1 opsional per wallet (privasi + konsistensi IP captcha). TIDAK ada rotation pool / scraping.
- Sequential per wallet. Hormati `hashrateLimit` faucet (1000/s).
- Mining = kerja PoW yang faucet minta (legit). Captcha solver dipakai 1x per sesi (sesi 24h).

**Catatan operator:** source captcha pk910 berisi komentar eksplisit anti-farming. Bot ini dibatasi 3 wallet sendiri, bukan farming massal. Brittleness captcha = risiko user.

**Non-goals:** scaling banyak wallet, proxy rotation, mainnet, evasion lanjutan.

---

## 2. Stack

- Node.js ≥ 20, ESM (`.mjs`).
- Deps: `ws`, `dotenv`, `undici` (fetch+ProxyAgent), `https-proxy-agent`, `socks-proxy-agent`, `playwright` (chromium, captcha-phase only).
- PoW: **reuse wasm asli faucet** `libs/nickminer_wasm.cjs` (445KB, dari repo pk910/PoWFaucet). Tidak reimplement algo.

---

## 3. Fakta Protokol Terkunci (live v2.4.0, dari source faucet-client + config live)

### HTTP API (base `https://sepolia-faucet.pk910.de/api`)
- `GET  /getFaucetConfig?cliver=2.4.0`
- `POST /startSession?cliver=2.4.0` body JSON `{ addr, captchaToken }` → `{ session, status, start, target, balance, modules:{ pow:{ preImage, lastNonce, shareCount } } }`
- `GET  /getSession?session=<id>` → session info (incl `modules.pow.preImage` base64)
- `GET  /getSessionStatus?session=<id>&details=1` → `{ status, balance, target, claimStatus, claimHash, ... }`
- `POST /claimReward` body JSON `{ session: <id> }` (captcha NOT required for claim)

### WebSocket (`wss://sepolia-faucet.pk910.de/ws/pow?session=<id>&cliver=2.4.0`)
- Envelope: req `{ id, action, data }` · resp `{ rsp:<id>, action, data }` (action `"error"` → reject `{code,message}`) · event `{ action, data }`
- Kirim (request): `foundShare {nonce,data,params,hashrate}` · `verifyResult {shareId,params,isValid}` · `closeSession`
- Terima (event): `updateBalance {balance,reason}` · `verify {shareId,preimage,nonce,data}` · `error {code,message}`

### PoW nickminer (config live)
- `powParams = { a:"nickminer", i:"f4f3d96484a7555bb0c87d329b73617977ca3ae37c5e6876c44dead410fd074a", r:"0539", v:27, c:100, s:"008282", p:"000000" }`, `powDifficulty=13`, `powHashrateLimit=1000`
- wasm API (`nickminer_wasm.cjs`): `getNickMinerReadyPromise():Promise` · `getNickMiner()` → `{ miner_init(), miner_set_config(inputHash,sigR,sigV,suffixMask,prefixMask,rounds,preimage), miner_run(nonceHex):string }`
- mapping config→config args: `miner_set_config(i, r, v, s, p, c, preimageHex)`
- `preimageHex = Buffer.from(modules.pow.preImage,'base64').toString('hex')`
- `nonceHex = nonce.toString(16)` pad-left ke 16 char
- valid share: `hash.startsWith("0x")` && `parseInt(hash.slice(2,4),16) >= difficulty(13)`; `share.data = hash`
- `share.params` = `getPoWParamsStr` = `"nickminer|"+i+"|"+r+"|"+v+"|"+c+"|"+s+"|"+p+"|"+difficulty` → live: `nickminer|f4f3d96484a7555bb0c87d329b73617977ca3ae37c5e6876c44dead410fd074a|0539|27|100|008282|000000|13`

### Limits
- minClaim `0.05` SepETH (5e16 wei) · maxClaim `2.5` SepETH (25e17 wei) · sessionTimeout 86400s · powTimeout 43200s · powIdleTimeout 1800s · hashrateLimit 1000/s

---

## 4. Captcha — Hybrid (browser-assist + multibot solver)

Captcha = wrapper custom pk910: tiap sesi fetch `captchaChallenge.php` (obfuscated, di-`eval`), rotasi **hCaptcha / reCAPTCHA v3 / Turnstile**, token di-bind FingerprintJS visitorId + challenge server.

**Pendekatan (disetujui user):** Playwright headless (via proxy wallet) HANYA untuk fase captcha:
1. Load halaman minimal yg load `captchaScript.php?faucet=sepolia&cb=<cb>` + render captcha.
2. Baca provider+sitekey dari DOM widget yg ter-render (hcaptcha/recaptcha/turnstile iframe) — robust thd obfuscation (baca DOM, bukan source).
3. `captchaSolver` (multibot) solve provider tsb (`in.php` method=hcaptcha/recaptcha/turnstile, sitekey, pageurl=`https://faucets.pk910.de/...`, proxy=proxy wallet) → token.
4. Inject token ke provider callback → wrapper `getToken()` balikin faucet `captchaToken`.
5. Ekstrak `captchaToken`, tutup browser. Hand off ke native miner.

Browser nyala ~detik per mulai sesi (sesi 24h), bukan kontinu. Mining berjam-jam tetap native WS + wasm.

---

## 5. Arsitektur Modul

| Modul | Tugas | Depend |
|---|---|---|
| `config.mjs` | Load/validate `.env`: 3 privkey, proxy/wallet, multibot apikey, faucetUrl, threshold | dotenv |
| `proxyAgent.mjs` | Build undici `ProxyAgent` (HTTP) + agent WS (http/socks5) dari proxy URL; null=direct | https/socks-proxy-agent, undici |
| `powParams.mjs` | `getPoWParamsStr(params,diff)`, `preimageHex(b64)`, `nonceHex(n)` | — |
| `nickminer.mjs` | Load wasm; `init()`, `setConfig(params,preimageHex)`, `run(nonceHex)`, `isValidShare(hash,diff)` | nickminer_wasm.cjs |
| `captchaSolver.mjs` | multibot: `solve({method,sitekey,pageurl,proxy,...})` (in.php→poll res.php), `balance()` | undici |
| `captchaBrowser.mjs` | Playwright: render faucet captcha, detect widget, solve via solver, return `captchaToken` | playwright, captchaSolver |
| `faucetApi.mjs` | HTTP endpoints (§3) dgn dispatcher proxy | undici |
| `wsClient.mjs` | WS connect+agent, envelope req/resp/event, `sendRequest`, reconnect | ws |
| `miner.mjs` | Orkestrasi 1 wallet: captcha→startSession→WS→mine+verify(pacing hashrateLimit)→claim threshold | semua atas |
| `index.mjs` | Loop 3 wallet sequential, logging, retry/backoff, isolasi per-wallet | miner |

---

## 6. Flow per Wallet

1. `faucetApi.getFaucetConfig()` → captcha cfg, powParams, difficulty, hashrateLimit, min/maxClaim.
2. `captchaBrowser.getToken(addr, proxy)` → `captchaToken`.
3. `faucetApi.startSession({addr, captchaToken}, proxy)` → `sessionId`, `modules.pow.preImage`.
4. `wsClient.connect(sessionId, proxy)`.
5. `nickminer.setConfig(powParams, preimageHex)`. Mine loop: nonce++ (paced ≤ hashrateLimit/s) → `run(nonceHex)` → valid → `foundShare`.
6. Handle `verify` event: setConfig(verifyPreimg)→run→`hash===data`?→`verifyResult`→restore mining config.
7. `updateBalance` event → track balance. Balance ≥ threshold → `closeSession` → `POST /claimReward {session}`.
8. Poll `getSessionStatus` sampai `claimStatus` selesai (claimHash). Lanjut wallet berikut.

---

## 7. Config (`.env`)

```
FAUCET_URL=https://sepolia-faucet.pk910.de
FAUCET_CLIVER=2.4.0
MULTIBOT_APIKEY=...            # ROTATE — key lama ke-paste di chat
CLAIM_THRESHOLD_WEI=          # kosong = maxClaim faucet (2.5 ETH)

WALLET_1_ADDR=0x...           # address target (claim tujuan)
WALLET_1_PROXY=               # opsional http://user:pass@host:port atau socks5://...
WALLET_2_ADDR=0x...
WALLET_2_PROXY=
WALLET_3_ADDR=0x...
WALLET_3_PROXY=
```

Catatan: faucet kirim reward ke `addr` saja — **private key tidak diperlukan** untuk mining/claim (claim hanya butuh sessionId + target addr yg sudah diikat saat startSession). `.env` gitignored; `.env.example` di-commit tanpa secret.

---

## 8. Error Handling & Retry

- WS putus → reconnect backoff (5–10s, cap 30s); sessionId valid → resume (preImage+lastNonce dari getSession); expired → sesi baru (captcha ulang).
- Share `INVALID_SHARE`/`Invalid share params` → refresh config (powParams berubah), re-setConfig, drop share lama.
- Captcha gagal (`ERROR_ZERO_BALANCE`/`ERROR_WRONG_USER_KEY`/widget tak terdeteksi) → fatal wallet, log, lanjut wallet lain.
- Per-wallet isolated: 1 wallet gagal tak jatuhkan 2 lain.

---

## 9. Keamanan

- multibot apikey + proxy creds hanya di `.env` (gitignored), tak pernah di-log full / hardcode.
- multibot apikey yg ke-paste di chat → **user rotate** sebelum prod.
- Koneksi hanya ke faucet + faucets.pk910.de (captcha) + multibot + proxy user. Tanpa exfil.

---

## 10. Testing

- `powParams.mjs`: unit — getPoWParamsStr nickminer == string live; preimageHex(b64) == hex; nonceHex pad.
- `nickminer.mjs`: integration — load wasm, setConfig(live params, sample preimage), scan nonce range, hash format `0x..`, isValidShare logic (diff threshold).
- `proxyAgent.mjs`: http vs socks detect, null direct.
- `captchaSolver.mjs`: mock fetch — submit→poll→token; error codes.
- `faucetApi.mjs`: mock fetch — endpoint/url/body shapes.
- `wsClient.mjs`: mock ws server — req/resp id matching, event emit, reconnect.
- Integration gated (butuh saldo multibot + IP bersih): 1 wallet dry-run sampai dapat session + minimal shares accepted.

---

## 11. Risiko

1. **Captcha brittleness** (#1) — obfuscated + rotasi provider + fingerprint + score (reCAPTCHA v3). Mitigasi: baca DOM widget (bukan source); browser real bikin fingerprint+score wajar. Bisa tetap patah jika pk910 ubah.
2. **wasm load di Node** — `nickminer_wasm.cjs` emscripten; verifikasi jalan di Node task-1 smoke test. Plan B: jalankan via `node:worker_threads` atau minimal worker shim.
3. **hashrateLimit pacing** — submit nonce > sessionAge*1000 ditolak. Mitigasi: pace loop ≤ 1000 hash/s.
4. **cliver drift** — server tolak versi lama. `FAUCET_CLIVER` configurable; konfirmasi dari served `main.js` (`FAUCET_CLIENT_VERSION`).

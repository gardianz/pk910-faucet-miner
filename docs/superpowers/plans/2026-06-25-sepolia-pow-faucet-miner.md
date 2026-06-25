# Sepolia PoW Faucet Miner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mine the pk910 Sepolia PoW faucet for 3 user-owned addresses (native WebSocket + reused nickminer WASM), solving the session-start captcha via a short-lived headless browser + multibot solver, then auto-claim at a threshold.

**Architecture:** Per wallet, a headless Chromium (only for the seconds-long captcha+startSession handshake, routed through the wallet's proxy) drives the real faucet page, solves the rendered captcha provider via multibot, and the bot intercepts the `/api/startSession` response to obtain `sessionId` + `preImage`. Mining then runs fully native: a WebSocket client speaks the faucet protocol while the faucet's own `nickminer_wasm.cjs` computes shares. Balance accrues via WS `updateBalance` events; at threshold the bot closes the session and POSTs `/api/claimReward`.

**Tech Stack:** Node.js ≥20 (ESM `.mjs`), `ws`, `undici`, `https-proxy-agent`, `socks-proxy-agent`, `playwright` (chromium), `dotenv`. PoW via reused `libs/nickminer_wasm.cjs` from pk910/PoWFaucet. Tests via Node's built-in `node:test`.

## Global Constraints

- Node ESM only (`"type": "module"`), file extension `.mjs`. Verbatim.
- Faucet base URL `https://sepolia-faucet.pk910.de`, WS `wss://sepolia-faucet.pk910.de/ws/pow`, cliver `2.4.0`. Verbatim.
- nickminer config (live): `i=f4f3d96484a7555bb0c87d329b73617977ca3ae37c5e6876c44dead410fd074a`, `r=0539`, `v=27`, `c=100`, `s=008282`, `p=000000`, `difficulty=13`, `hashrateLimit=1000`. Read at runtime from `getFaucetConfig`; the constants above are only for tests.
- Secrets (multibot apikey, proxy creds) only from `.env` (gitignored). Never log full secrets, never hardcode.
- Scope hard cap: exactly the 3 wallets from `.env`. No address generation, no proxy pools.

---

### Task 1: Project scaffold + reuse nickminer WASM + Node-load smoke test

**Files:**
- Create: `package.json`, `.gitignore`, `.env.example`
- Create (download): `libs/nickminer_wasm.cjs`, `libs/nickminer_wasm.d.ts`
- Test: `test/wasm-smoke.test.mjs`

**Interfaces:**
- Produces: a Node-importable nickminer module exposing `getNickMinerReadyPromise(): Promise<void>` and `getNickMiner(): { miner_init(), miner_set_config(i,r,v,s,p,c,preimageHex), miner_run(nonceHex): string }`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "sepolia-pow-faucet-miner",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "start": "node src/index.mjs",
    "test": "node --test"
  },
  "engines": { "node": ">=20" },
  "dependencies": {
    "dotenv": "^16.4.5",
    "https-proxy-agent": "^7.0.5",
    "socks-proxy-agent": "^8.0.4",
    "undici": "^6.19.8",
    "ws": "^8.18.0",
    "playwright": "^1.47.0"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
.env
*.log
state/
```

- [ ] **Step 3: Create `.env.example`**

```
FAUCET_URL=https://sepolia-faucet.pk910.de
FAUCET_CLIVER=2.4.0
MULTIBOT_APIKEY=replace-me-rotate-the-leaked-key
CLAIM_THRESHOLD_WEI=

WALLET_1_ADDR=0x0000000000000000000000000000000000000000
WALLET_1_PROXY=
WALLET_2_ADDR=0x0000000000000000000000000000000000000000
WALLET_2_PROXY=
WALLET_3_ADDR=0x0000000000000000000000000000000000000000
WALLET_3_PROXY=
```

- [ ] **Step 4: Download the nickminer WASM from pk910/PoWFaucet**

Run:
```bash
mkdir -p libs && \
curl -fsSL -o libs/nickminer_wasm.cjs  https://raw.githubusercontent.com/pk910/PoWFaucet/master/libs/nickminer_wasm.cjs && \
curl -fsSL -o libs/nickminer_wasm.d.ts https://raw.githubusercontent.com/pk910/PoWFaucet/master/libs/nickminer_wasm.d.ts && \
wc -c libs/nickminer_wasm.cjs
```
Expected: `nickminer_wasm.cjs` ≈ 445361 bytes.

- [ ] **Step 5: Install deps + chromium**

Run:
```bash
npm install && npx playwright install chromium
```
Expected: completes without error.

- [ ] **Step 6: Write the failing smoke test** — `test/wasm-smoke.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const wasmPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../libs/nickminer_wasm.cjs");

test("nickminer wasm loads and runs in Node", async () => {
  const mod = require(wasmPath);
  await mod.getNickMinerReadyPromise();
  const miner = mod.getNickMiner();
  miner.miner_init();
  // live params; preimage = any 32-byte hex
  miner.miner_set_config(
    "f4f3d96484a7555bb0c87d329b73617977ca3ae37c5e6876c44dead410fd074a",
    "0539", 27, "008282", "000000", 100,
    "00".repeat(32)
  );
  const hash = miner.miner_run("0000000000000001");
  assert.equal(typeof hash, "string");
  assert.ok(hash.startsWith("0x"), `expected 0x-hash, got ${hash}`);
});
```

- [ ] **Step 7: Run the smoke test**

Run: `node --test test/wasm-smoke.test.mjs`
Expected: PASS. If it fails because the CJS references a browser-only global (e.g. `Worker`, `document`), add a shim at the top of the test (`globalThis.atob ??= (b)=>Buffer.from(b,"base64").toString("binary")`) and record the needed shim in `libs/README.md`. (Node 20 already provides `atob`/`btoa`/`fetch`.)

- [ ] **Step 8: Commit**

```bash
git init && git add -A && git commit -m "chore: scaffold + vendored nickminer wasm with Node smoke test"
```

---

### Task 2: `powParams.mjs` — protocol string + preimage + nonce encoding

**Files:**
- Create: `src/powParams.mjs`
- Test: `test/powParams.test.mjs`

**Interfaces:**
- Produces: `getPoWParamsStr(params, difficulty): string`, `preimageHex(b64: string): string`, `nonceHex(nonce: number): string`.

- [ ] **Step 1: Write the failing test** — `test/powParams.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { getPoWParamsStr, preimageHex, nonceHex } from "../src/powParams.mjs";

const params = { a: "nickminer", i: "f4f3d96484a7555bb0c87d329b73617977ca3ae37c5e6876c44dead410fd074a", r: "0539", v: 27, c: 100, s: "008282", p: "000000" };

test("getPoWParamsStr matches live nickminer format", () => {
  assert.equal(
    getPoWParamsStr(params, 13),
    "nickminer|f4f3d96484a7555bb0c87d329b73617977ca3ae37c5e6876c44dead410fd074a|0539|27|100|008282|000000|13"
  );
});

test("preimageHex decodes base64 to hex", () => {
  // base64 of bytes [0x00,0xff,0x10] => "AP8Q"
  assert.equal(preimageHex("AP8Q"), "00ff10");
});

test("nonceHex left-pads to 16 chars", () => {
  assert.equal(nonceHex(1), "0000000000000001");
  assert.equal(nonceHex(0xabcdef), "0000000000abcdef");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/powParams.test.mjs`
Expected: FAIL (Cannot find module `../src/powParams.mjs`).

- [ ] **Step 3: Implement** — `src/powParams.mjs`

```js
// Mirrors pk910 faucet-client getPoWParamsStr (nickminer branch) + worker nonce/preimage encoding.
export function getPoWParamsStr(params, difficulty) {
  return [params.a, params.i, params.r, params.v, params.c, params.s, params.p, difficulty].join("|");
}

export function preimageHex(b64) {
  return Buffer.from(b64, "base64").toString("hex");
}

export function nonceHex(nonce) {
  let h = nonce.toString(16);
  if (h.length < 16) h = "0".repeat(16 - h.length) + h;
  return h;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/powParams.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/powParams.mjs test/powParams.test.mjs && git commit -m "feat: pow params string + preimage/nonce encoding"
```

---

### Task 3: `nickminer.mjs` — WASM wrapper + share validity

**Files:**
- Create: `src/nickminer.mjs`
- Test: `test/nickminer.test.mjs`

**Interfaces:**
- Consumes: `libs/nickminer_wasm.cjs` (Task 1).
- Produces: `initNickminer(): Promise<void>`, `setConfig(params, preimageHex): void`, `run(nonceHex): string`, `isValidShare(hash, difficulty): boolean`.

- [ ] **Step 1: Write the failing test** — `test/nickminer.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { initNickminer, setConfig, run, isValidShare } from "../src/nickminer.mjs";
import { nonceHex } from "../src/powParams.mjs";

const params = { a: "nickminer", i: "f4f3d96484a7555bb0c87d329b73617977ca3ae37c5e6876c44dead410fd074a", r: "0539", v: 27, c: 100, s: "008282", p: "000000" };

test("isValidShare checks first hash byte vs difficulty", () => {
  assert.equal(isValidShare("0x0d" + "ab".repeat(20), 13), true);   // 0x0d = 13
  assert.equal(isValidShare("0x0c" + "ab".repeat(20), 13), false);  // 0x0c = 12
  assert.equal(isValidShare("not-a-hash", 13), false);
  assert.equal(isValidShare("", 13), false);
});

test("run returns a 0x hash for sequential nonces", async () => {
  await initNickminer();
  setConfig(params, "11".repeat(32));
  for (let n = 1; n <= 5; n++) {
    const h = run(nonceHex(n));
    assert.ok(typeof h === "string" && h.startsWith("0x"), `nonce ${n} -> ${h}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/nickminer.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/nickminer.mjs`

```js
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const wasmPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../libs/nickminer_wasm.cjs");

let miner = null;

export async function initNickminer() {
  const mod = require(wasmPath);
  await mod.getNickMinerReadyPromise();
  miner = mod.getNickMiner();
  miner.miner_init();
}

// params: { i, r, v, c, s, p }  (from faucet config powParams)
export function setConfig(params, preimageHexStr) {
  if (!miner) throw new Error("nickminer not initialized");
  miner.miner_set_config(params.i, params.r, params.v, params.s, params.p, params.c, preimageHexStr);
}

export function run(nonceHexStr) {
  return miner.miner_run(nonceHexStr);
}

// mirrors PoWWorker.checkHash nickminer branch
export function isValidShare(hash, difficulty) {
  if (typeof hash !== "string" || !hash.startsWith("0x") || hash.length < 4) return false;
  const got = parseInt(hash.slice(2, 4), 16);
  return Number.isFinite(got) && got >= difficulty;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/nickminer.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nickminer.mjs test/nickminer.test.mjs && git commit -m "feat: nickminer wasm wrapper + share validity"
```

---

### Task 4: `proxyAgent.mjs` — HTTP dispatcher + WS agent

**Files:**
- Create: `src/proxyAgent.mjs`
- Test: `test/proxyAgent.test.mjs`

**Interfaces:**
- Produces: `httpDispatcher(proxyUrl?): Dispatcher|undefined`, `wsAgent(proxyUrl?): Agent|undefined`.

- [ ] **Step 1: Write the failing test** — `test/proxyAgent.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { httpDispatcher, wsAgent } from "../src/proxyAgent.mjs";
import { SocksProxyAgent } from "socks-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";

test("returns undefined for empty proxy", () => {
  assert.equal(httpDispatcher(""), undefined);
  assert.equal(wsAgent(undefined), undefined);
});

test("wsAgent picks socks vs http by scheme", () => {
  assert.ok(wsAgent("socks5://1.2.3.4:1080") instanceof SocksProxyAgent);
  assert.ok(wsAgent("http://1.2.3.4:8080") instanceof HttpsProxyAgent);
});

test("httpDispatcher returns a dispatcher for a proxy url", () => {
  assert.ok(httpDispatcher("http://1.2.3.4:8080"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/proxyAgent.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/proxyAgent.mjs`

```js
import { ProxyAgent } from "undici";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

export function httpDispatcher(proxyUrl) {
  if (!proxyUrl) return undefined;
  return new ProxyAgent(proxyUrl);
}

export function wsAgent(proxyUrl) {
  if (!proxyUrl) return undefined;
  return proxyUrl.startsWith("socks") ? new SocksProxyAgent(proxyUrl) : new HttpsProxyAgent(proxyUrl);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/proxyAgent.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/proxyAgent.mjs test/proxyAgent.test.mjs && git commit -m "feat: proxy http dispatcher + ws agent"
```

---

### Task 5: `config.mjs` — load + validate `.env`

**Files:**
- Create: `src/config.mjs`
- Test: `test/config.test.mjs`

**Interfaces:**
- Produces: `loadConfig(env = process.env): { faucetUrl, wsUrl, cliver, multibotApikey, claimThresholdWei: bigint|null, wallets: {addr, proxy}[] }`.

- [ ] **Step 1: Write the failing test** — `test/config.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.mjs";

const base = {
  FAUCET_URL: "https://sepolia-faucet.pk910.de",
  FAUCET_CLIVER: "2.4.0",
  MULTIBOT_APIKEY: "key123",
  WALLET_1_ADDR: "0x1111111111111111111111111111111111111111",
  WALLET_1_PROXY: "http://u:p@1.2.3.4:8080",
  WALLET_2_ADDR: "0x2222222222222222222222222222222222222222",
};

test("parses wallets, proxies, ws url, threshold", () => {
  const cfg = loadConfig({ ...base, CLAIM_THRESHOLD_WEI: "50000000000000000" });
  assert.equal(cfg.wsUrl, "wss://sepolia-faucet.pk910.de/ws/pow");
  assert.equal(cfg.cliver, "2.4.0");
  assert.equal(cfg.wallets.length, 2);
  assert.equal(cfg.wallets[0].proxy, "http://u:p@1.2.3.4:8080");
  assert.equal(cfg.wallets[1].proxy, undefined);
  assert.equal(cfg.claimThresholdWei, 50000000000000000n);
});

test("null threshold when unset", () => {
  assert.equal(loadConfig(base).claimThresholdWei, null);
});

test("rejects bad address", () => {
  assert.throws(() => loadConfig({ ...base, WALLET_1_ADDR: "nope" }), /WALLET_1_ADDR/);
});

test("requires multibot apikey", () => {
  const { MULTIBOT_APIKEY, ...noKey } = base;
  assert.throws(() => loadConfig(noKey), /MULTIBOT_APIKEY/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/config.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/config.mjs`

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/config.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config.mjs test/config.test.mjs && git commit -m "feat: env config load + validation"
```

---

### Task 6: `captchaSolver.mjs` — multibot client

**Files:**
- Create: `src/captchaSolver.mjs`
- Test: `test/captchaSolver.test.mjs`

**Interfaces:**
- Produces: `class CaptchaSolver { constructor(apikey, fetchFn=globalFetch); submit(opts): Promise<string id>; poll(id, opts): Promise<string token>; solve(opts): Promise<string token>; balance(): Promise<string> }` where `opts = { method, sitekey?, pageurl, proxy?, extra? }` and `method ∈ {"hcaptcha","userrecaptcha","turnstile"}`.

- [ ] **Step 1: Write the failing test** — `test/captchaSolver.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { CaptchaSolver } from "../src/captchaSolver.mjs";

function fakeFetch(seq) {
  let i = 0;
  return async (url) => ({ text: async () => seq[i++] });
}

test("solve submits then polls until token", async () => {
  const solver = new CaptchaSolver("k", fakeFetch(["OK|42", "CAPCHA_NOT_READY", "OK|the-token"]));
  const token = await solver.solve({ method: "hcaptcha", sitekey: "abc", pageurl: "https://x" }, { intervalMs: 1 });
  assert.equal(token, "the-token");
});

test("submit throws on error response", async () => {
  const solver = new CaptchaSolver("k", fakeFetch(["ERROR_ZERO_BALANCE"]));
  await assert.rejects(() => solver.submit({ method: "hcaptcha", sitekey: "a", pageurl: "https://x" }), /ERROR_ZERO_BALANCE/);
});

test("poll throws on hard error", async () => {
  const solver = new CaptchaSolver("k", fakeFetch(["ERROR_CAPTCHA_UNSOLVABLE"]));
  await assert.rejects(() => solver.poll("42", { intervalMs: 1 }), /ERROR_CAPTCHA_UNSOLVABLE/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/captchaSolver.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/captchaSolver.mjs`

```js
const BASE = "https://api.multibot.cloud";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class CaptchaSolver {
  constructor(apikey, fetchFn = (url) => fetch(url)) {
    this.apikey = apikey;
    this.fetchFn = fetchFn;
  }

  async _get(url) {
    const res = await this.fetchFn(url);
    return (await res.text()).trim();
  }

  // opts: { method, sitekey?, pageurl, proxy?, extra? }
  async submit({ method, sitekey, pageurl, proxy, extra = {} }) {
    const params = new URLSearchParams({ key: this.apikey, method, pageurl, json: "0", ...extra });
    if (sitekey) params.set("sitekey", sitekey);
    if (proxy) {
      params.set("proxy", proxy.replace(/^\w+:\/\//, ""));
      params.set("proxytype", proxy.startsWith("socks5") ? "SOCKS5" : "HTTP");
    }
    const res = await this._get(`${BASE}/in.php?${params.toString()}`);
    if (!res.startsWith("OK|")) throw new Error(`multibot submit failed: ${res}`);
    return res.slice(3);
  }

  async poll(id, { timeoutMs = 180000, intervalMs = 5000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await this._get(`${BASE}/res.php?key=${this.apikey}&action=get&id=${id}`);
      if (res === "CAPCHA_NOT_READY") { await sleep(intervalMs); continue; }
      if (res.startsWith("OK|")) return res.slice(3);
      throw new Error(`multibot poll failed: ${res}`);
    }
    throw new Error("multibot poll timeout");
  }

  async solve(opts, pollOpts = {}) {
    const id = await this.submit(opts);
    return this.poll(id, pollOpts);
  }

  async balance() {
    return this._get(`${BASE}/res.php?action=userinfo&key=${this.apikey}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/captchaSolver.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/captchaSolver.mjs test/captchaSolver.test.mjs && git commit -m "feat: multibot captcha solver client"
```

---

### Task 7: `faucetApi.mjs` — HTTP endpoints

**Files:**
- Create: `src/faucetApi.mjs`
- Test: `test/faucetApi.test.mjs`

**Interfaces:**
- Consumes: `httpDispatcher` (Task 4).
- Produces: `class FaucetApi { constructor(faucetUrl, cliver, requestFn?); getFaucetConfig(proxy?); getSession(id, proxy?); getSessionStatus(id, proxy?); claimReward(id, proxy?) }`. Each returns parsed JSON. `requestFn(url, options)` defaults to undici `request`; injected in tests.

- [ ] **Step 1: Write the failing test** — `test/faucetApi.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { FaucetApi } from "../src/faucetApi.mjs";

function recorder(responseJson) {
  const calls = [];
  const requestFn = async (url, options = {}) => {
    calls.push({ url, options });
    return { body: { json: async () => responseJson, text: async () => JSON.stringify(responseJson) } };
  };
  return { calls, requestFn };
}

test("getFaucetConfig hits cliver-tagged endpoint", async () => {
  const { calls, requestFn } = recorder({ modules: {} });
  const api = new FaucetApi("https://sepolia-faucet.pk910.de", "2.4.0", requestFn);
  await api.getFaucetConfig();
  assert.match(calls[0].url, /\/api\/getFaucetConfig\?cliver=2\.4\.0$/);
});

test("claimReward posts session body", async () => {
  const { calls, requestFn } = recorder({ status: "claiming" });
  const api = new FaucetApi("https://sepolia-faucet.pk910.de", "2.4.0", requestFn);
  await api.claimReward("sess-1");
  assert.match(calls[0].url, /\/api\/claimReward$/);
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { session: "sess-1" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/faucetApi.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/faucetApi.mjs`

```js
import { request as undiciRequest } from "undici";
import { httpDispatcher } from "./proxyAgent.mjs";

export class FaucetApi {
  constructor(faucetUrl, cliver, requestFn = undiciRequest) {
    this.base = faucetUrl.replace(/\/$/, "") + "/api";
    this.cliver = cliver;
    this.requestFn = requestFn;
  }

  async _get(path, proxy) {
    const res = await this.requestFn(this.base + path, { dispatcher: httpDispatcher(proxy) });
    return res.body.json();
  }

  async _post(path, body, proxy) {
    const res = await this.requestFn(this.base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      dispatcher: httpDispatcher(proxy),
    });
    return res.body.json();
  }

  getFaucetConfig(proxy) { return this._get(`/getFaucetConfig?cliver=${encodeURIComponent(this.cliver)}`, proxy); }
  getSession(id, proxy) { return this._get(`/getSession?session=${encodeURIComponent(id)}`, proxy); }
  getSessionStatus(id, proxy) { return this._get(`/getSessionStatus?session=${encodeURIComponent(id)}&details=1`, proxy); }
  claimReward(id, proxy) { return this._post(`/claimReward`, { session: id }, proxy); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/faucetApi.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/faucetApi.mjs test/faucetApi.test.mjs && git commit -m "feat: faucet HTTP api client"
```

---

### Task 8: `wsClient.mjs` — faucet WebSocket protocol

**Files:**
- Create: `src/wsClient.mjs`
- Test: `test/wsClient.test.mjs`

**Interfaces:**
- Consumes: `wsAgent` (Task 4), `ws` package.
- Produces: `class WsClient extends EventEmitter { constructor({ wsUrl, sessionId, cliver, proxy }); connect(): Promise<void>; sendRequest(action, data?): Promise<any>; sendMessage(action, data?): void; close(): void }`. Emits `open`, `close`, and one event per server `action` (e.g. `updateBalance`, `verify`, `error`) carrying the raw `{action,data}` message.

- [ ] **Step 1: Write the failing test** — `test/wsClient.test.mjs`

Uses a real local `ws` server that echoes the protocol envelope.

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocketServer } from "ws";
import { WsClient } from "../src/wsClient.mjs";

function startServer(handler) {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port: 0 }, () => {
      resolve({ wss, port: wss.address().port });
    });
    wss.on("connection", (sock) => {
      sock.on("message", (raw) => handler(sock, JSON.parse(raw.toString())));
    });
  });
}

test("sendRequest resolves on matching rsp", async () => {
  const { wss, port } = await startServer((sock, msg) => {
    if (msg.action === "foundShare") sock.send(JSON.stringify({ rsp: msg.id, action: "ok", data: { accepted: true } }));
  });
  const client = new WsClient({ wsUrl: `ws://127.0.0.1:${port}/ws/pow`, sessionId: "s1", cliver: "2.4.0" });
  await client.connect();
  const res = await client.sendRequest("foundShare", { nonce: 1 });
  assert.deepEqual(res, { accepted: true });
  client.close(); wss.close();
});

test("sendRequest rejects on error action", async () => {
  const { wss, port } = await startServer((sock, msg) => {
    sock.send(JSON.stringify({ rsp: msg.id, action: "error", data: { code: "INVALID_SHARE", message: "bad" } }));
  });
  const client = new WsClient({ wsUrl: `ws://127.0.0.1:${port}/ws/pow`, sessionId: "s1", cliver: "2.4.0" });
  await client.connect();
  await assert.rejects(() => client.sendRequest("foundShare", {}), /INVALID_SHARE/);
  client.close(); wss.close();
});

test("emits server events by action", async () => {
  const { wss, port } = await startServer((sock) => {
    sock.send(JSON.stringify({ action: "updateBalance", data: { balance: "100", reason: "share" } }));
  });
  const client = new WsClient({ wsUrl: `ws://127.0.0.1:${port}/ws/pow`, sessionId: "s1", cliver: "2.4.0" });
  await client.connect();
  const data = await new Promise((res) => client.on("updateBalance", (m) => res(m.data)));
  assert.equal(data.balance, "100");
  client.close(); wss.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/wsClient.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/wsClient.mjs`

```js
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { wsAgent } from "./proxyAgent.mjs";

export class WsClient extends EventEmitter {
  constructor({ wsUrl, sessionId, cliver, proxy }) {
    super();
    this.url = `${wsUrl}?session=${encodeURIComponent(sessionId)}&cliver=${encodeURIComponent(cliver)}`;
    this.proxy = proxy;
    this.sock = null;
    this.reqId = 1;
    this.pending = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.sock = new WebSocket(this.url, { agent: wsAgent(this.proxy) });
      this.sock.on("open", () => { this.emit("open"); resolve(); });
      this.sock.on("close", () => this.emit("close"));
      this.sock.on("error", (err) => { this.emit("error", { data: { code: "WS", message: String(err) } }); reject(err); });
      this.sock.on("message", (raw) => this._onMessage(raw));
    });
  }

  _onMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (Object.prototype.hasOwnProperty.call(msg, "rsp")) {
      const dfd = this.pending.get(msg.rsp);
      if (!dfd) return;
      this.pending.delete(msg.rsp);
      if (msg.action === "error") dfd.reject(new Error(`[${msg.data?.code}] ${msg.data?.message}`));
      else dfd.resolve(msg.data);
      return;
    }
    if (msg.action) this.emit(msg.action, msg);
  }

  sendRequest(action, data) {
    return new Promise((resolve, reject) => {
      if (!this.sock || this.sock.readyState !== WebSocket.OPEN) return reject(new Error("ws not open"));
      const id = this.reqId++;
      this.pending.set(id, { resolve, reject });
      const message = { id, action };
      if (data !== undefined) message.data = data;
      this.sock.send(JSON.stringify(message));
    });
  }

  sendMessage(action, data) {
    const message = { action };
    if (data !== undefined) message.data = data;
    this.sock.send(JSON.stringify(message));
  }

  close() {
    if (this.sock) { try { this.sock.close(); } catch {} this.sock = null; }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/wsClient.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/wsClient.mjs test/wsClient.test.mjs && git commit -m "feat: faucet websocket protocol client"
```

---

### Task 9: `captchaBrowser.mjs` — solve session-start captcha, capture session

**Files:**
- Create: `src/captchaBrowser.mjs`
- Test: `test/captchaBrowser.manual.md` (manual/live validation notes — no unit test; this module is I/O against the live faucet)

**Interfaces:**
- Consumes: `CaptchaSolver` (Task 6).
- Produces: `startSessionViaBrowser({ faucetUrl, addr, proxy, solver, headless=true, timeoutMs=180000 }): Promise<sessionInfo>` where `sessionInfo` is the parsed JSON body of the faucet's `POST /api/startSession` response (contains `session`, `status`, `target`, `modules.pow.preImage`).

**Design notes (read before implementing):** Drive the real faucet page so the obfuscated captcha wrapper builds the correctly-bound `captchaToken` itself. We only (a) detect the rendered provider + sitekey from the DOM, (b) get a token from multibot, (c) inject it via the provider's standard hook, (d) let the page's own "Start Mining" call `/api/startSession`, and (e) intercept that response. This avoids reproducing pk910's token binding.

- [ ] **Step 1: Implement** — `src/captchaBrowser.mjs`

```js
import { chromium } from "playwright";

// Detect provider + sitekey from the rendered widgets.
async function detectProvider(page) {
  return page.evaluate(() => {
    const find = (sel) => document.querySelector(sel);
    // hCaptcha
    let el = find('[data-hcaptcha-widget-id], .h-captcha, iframe[src*="hcaptcha.com"]');
    if (el) {
      const host = document.querySelector('.h-captcha,[data-sitekey]');
      const key = host?.getAttribute('data-sitekey') ||
        (find('iframe[src*="hcaptcha.com"]')?.src.match(/sitekey=([^&]+)/)?.[1]);
      return { provider: "hcaptcha", sitekey: key };
    }
    // Turnstile
    el = find('.cf-turnstile, iframe[src*="challenges.cloudflare.com"]');
    if (el) {
      const host = document.querySelector('.cf-turnstile,[data-sitekey]');
      const key = host?.getAttribute('data-sitekey') ||
        (find('iframe[src*="challenges.cloudflare.com"]')?.src.match(/sitekey=([^&]+)/)?.[1]);
      return { provider: "turnstile", sitekey: key };
    }
    // reCAPTCHA
    el = find('.g-recaptcha, iframe[src*="recaptcha"]');
    if (el) {
      const host = document.querySelector('.g-recaptcha,[data-sitekey]');
      const key = host?.getAttribute('data-sitekey') ||
        (find('iframe[src*="recaptcha"]')?.src.match(/[?&]k=([^&]+)/)?.[1]);
      return { provider: "recaptcha", sitekey: key };
    }
    return { provider: null, sitekey: null };
  });
}

async function injectToken(page, provider, token) {
  await page.evaluate(({ provider, token }) => {
    if (provider === "hcaptcha") {
      document.querySelectorAll('[name="h-captcha-response"], textarea#h-captcha-response')
        .forEach((e) => { e.value = token; });
      if (window.hcaptcha && window.__hcaptchaCb) window.__hcaptchaCb(token);
    } else if (provider === "turnstile") {
      document.querySelectorAll('[name="cf-turnstile-response"]').forEach((e) => { e.value = token; });
    } else if (provider === "recaptcha") {
      document.querySelectorAll('[name="g-recaptcha-response"], #g-recaptcha-response')
        .forEach((e) => { e.value = token; });
    }
  }, { provider, token });
}

export async function startSessionViaBrowser({ faucetUrl, addr, proxy, solver, headless = true, timeoutMs = 180000 }) {
  const launchOpts = { headless };
  if (proxy) launchOpts.proxy = { server: proxy };
  const browser = await chromium.launch(launchOpts);
  try {
    const page = await browser.newPage();
    // For recaptcha v3 the page reads grecaptcha.execute() internally — stub it once we have a token.
    const startSessionBody = new Promise((resolve) => {
      page.on("response", async (resp) => {
        if (resp.url().includes("/api/startSession")) {
          try { resolve(await resp.json()); } catch { /* ignore */ }
        }
      });
    });

    await page.goto(faucetUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.fill('input[type="text"], input[placeholder*="ddress"]', addr);

    // wait for a captcha widget to render
    await page.waitForSelector(
      'iframe[src*="hcaptcha.com"], iframe[src*="challenges.cloudflare.com"], iframe[src*="recaptcha"]',
      { timeout: timeoutMs }
    );
    const { provider, sitekey } = await detectProvider(page);
    if (!provider || !sitekey) throw new Error("captcha provider/sitekey not detected");

    const method = provider === "recaptcha" ? "userrecaptcha" : provider;
    const token = await solver.solve({ method, sitekey, pageurl: faucetUrl, proxy });

    if (provider === "recaptcha") {
      await page.addInitScript((t) => {
        const ret = () => Promise.resolve(t);
        Object.defineProperty(window, "grecaptcha", { value: { ready: (cb) => cb(), execute: ret, render: () => 0 }, configurable: true });
      }, token);
    }
    await injectToken(page, provider, token);

    // trigger session start (button text "Start Mining" / "Request")
    await page.click('button:has-text("Start Mining"), button:has-text("Request"), button[type="submit"]');

    const sessionInfo = await Promise.race([
      startSessionBody,
      new Promise((_, rej) => setTimeout(() => rej(new Error("startSession timeout")), timeoutMs)),
    ]);
    if (!sessionInfo || !sessionInfo.session) throw new Error(`startSession failed: ${JSON.stringify(sessionInfo)}`);
    return sessionInfo;
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 2: Create live-validation notes** — `test/captchaBrowser.manual.md`

```md
# Manual validation: captchaBrowser

Requires: funded multibot balance, a clean IP (or the wallet proxy), one throwaway address.

1. Set MULTIBOT_APIKEY + WALLET_1_ADDR in `.env`.
2. Run: `node -e "import('./src/captchaBrowser.mjs').then(async m=>{const {CaptchaSolver}=await import('./src/captchaSolver.mjs');const s=new CaptchaSolver(process.env.MULTIBOT_APIKEY);const r=await m.startSessionViaBrowser({faucetUrl:'https://sepolia-faucet.pk910.de',addr:process.env.WALLET_1_ADDR,solver:s,headless:false});console.log(r.session, r.modules?.pow?.preImage?'has-preimage':'no-preimage');})"`
3. Expect: a session id is printed and `has-preimage`.
4. If provider detection fails, run with `headless:false`, inspect the rendered widget, and extend `detectProvider`/`injectToken` selectors for the provider actually shown. Record which provider the faucet currently serves.
```

- [ ] **Step 3: Run live validation**

Run the command in `test/captchaBrowser.manual.md` step 2.
Expected: prints a session id + `has-preimage`. Iterate selectors until it does.

- [ ] **Step 4: Commit**

```bash
git add src/captchaBrowser.mjs test/captchaBrowser.manual.md && git commit -m "feat: browser-assisted captcha + session start capture"
```

---

### Task 10: `miner.mjs` — single-wallet orchestration (mine + verify + claim)

**Files:**
- Create: `src/miner.mjs`
- Test: `test/miner.test.mjs` (unit-tests the pure helpers; full run is exercised in Task 11 live)

**Interfaces:**
- Consumes: all prior modules.
- Produces: `mineWallet({ wallet, cfg, api, solver, deps })` returning `{ status, sessionId, balance, claimHash }`; and pure helper `nextNonceBudget(sessionStartSec, lastNonce, hashrateLimit, now=Date.now()): number` (how many nonces may be processed now without exceeding the faucet's hashrate limit).

- [ ] **Step 1: Write the failing test** — `test/miner.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextNonceBudget } from "../src/miner.mjs";

test("nonce budget respects hashrate limit", () => {
  const start = 1000; // sec
  const now = (start + 10) * 1000; // 10s later, ms
  // allowed ~ (10+4)*1000 - lastNonce
  assert.equal(nextNonceBudget(start, 0, 1000, now), 14000);
  assert.equal(nextNonceBudget(start, 13990, 1000, now), 10);
  assert.equal(nextNonceBudget(start, 999999, 1000, now), 0); // already ahead
});

test("no limit when hashrateLimit <= 0", () => {
  assert.equal(nextNonceBudget(1000, 0, 0, 2000), Infinity);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/miner.test.mjs`
Expected: FAIL (module not found / export missing).

- [ ] **Step 3: Implement** — `src/miner.mjs`

```js
import { initNickminer, setConfig, run, isValidShare } from "./nickminer.mjs";
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

export async function mineWallet({ wallet, cfg, api, solver, log = console }) {
  const faucetConfig = await api.getFaucetConfig(wallet.proxy);
  const pow = faucetConfig.modules.pow;
  const params = pow.powParams;
  const difficulty = pow.powDifficulty;
  const hashrateLimit = pow.powHashrateLimit || 0;
  const paramsStr = getPoWParamsStr(params, difficulty);
  const threshold = cfg.claimThresholdWei ?? BigInt(faucetConfig.maxClaim);

  log.info?.(`[${wallet.addr}] starting captcha + session`);
  const sessionInfo = await startSessionViaBrowser({
    faucetUrl: cfg.faucetUrl, addr: wallet.addr, proxy: wallet.proxy, solver,
  });
  const sessionId = sessionInfo.session;
  const startSec = sessionInfo.start;
  const preImage = sessionInfo.modules?.pow?.preImage;
  if (!preImage) throw new Error("session has no pow preImage");
  const preHex = preimageHex(preImage);

  await initNickminer();
  setConfig(params, preHex);

  const ws = new WsClient({ wsUrl: cfg.wsUrl, sessionId, cliver: cfg.cliver, proxy: wallet.proxy });
  let balance = BigInt(sessionInfo.balance || "0");
  let lastNonce = (sessionInfo.modules?.pow?.lastNonce ?? 0) + 1;

  ws.on("updateBalance", (m) => {
    balance = BigInt(m.data.balance);
    log.info?.(`[${wallet.addr}] balance=${balance} (${m.data.reason})`);
  });
  ws.on("verify", (m) => {
    // verify another miner's share with the verification preimage, then restore our config
    const vPre = preimageHex(m.data.preimage);
    setConfig(params, vPre);
    const h = run(nonceHex(m.data.nonce));
    const isValid = (h === m.data.data);
    setConfig(params, preHex);
    ws.sendRequest("verifyResult", { shareId: m.data.shareId, params: paramsStr, isValid }).catch(() => {});
  });
  ws.on("error", (m) => log.warn?.(`[${wallet.addr}] ws error ${m.data?.code}: ${m.data?.message}`));

  await ws.connect();

  // mining loop, paced to hashrate limit, until threshold reached
  while (balance < threshold) {
    const budget = nextNonceBudget(startSec, lastNonce, hashrateLimit);
    if (budget <= 0) { await sleep(1000); continue; }
    const batch = Math.min(budget, 1000);
    for (let k = 0; k < batch; k++) {
      const hash = run(nonceHex(lastNonce));
      if (isValidShare(hash, difficulty)) {
        ws.sendRequest("foundShare", { nonce: lastNonce, data: hash, params: paramsStr, hashrate: hashrateLimit })
          .catch((err) => log.warn?.(`[${wallet.addr}] share rejected: ${err.message}`));
      }
      lastNonce++;
    }
    await sleep(1000); // 1 batch/sec keeps us within hashrateLimit
  }

  log.info?.(`[${wallet.addr}] threshold reached (${balance}); closing + claiming`);
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
  return { status: "done", sessionId, balance: balance.toString(), claimHash };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/miner.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/miner.mjs test/miner.test.mjs && git commit -m "feat: single-wallet mining orchestration + claim"
```

---

### Task 11: `index.mjs` — sequential 3-wallet runner + live end-to-end

**Files:**
- Create: `src/index.mjs`, `README.md`
- Test: live end-to-end (manual)

**Interfaces:**
- Consumes: `loadConfig`, `FaucetApi`, `CaptchaSolver`, `mineWallet`.

- [ ] **Step 1: Implement** — `src/index.mjs`

```js
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
```

- [ ] **Step 2: Write `README.md`**

````md
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
````

- [ ] **Step 3: Run full test suite**

Run: `node --test`
Expected: all unit tests PASS.

- [ ] **Step 4: Live end-to-end (one wallet, low threshold)**

Set `CLAIM_THRESHOLD_WEI=50000000000000000` (minClaim 0.05) and only `WALLET_1_ADDR` in `.env`, then:
Run: `npm start`
Expected: logs captcha solve → session id → balance increasing → close+claim → `claimHash=0x...`. Verify the tx on `https://sepolia.etherscan.io/tx/<claimHash>`.

- [ ] **Step 5: Commit**

```bash
git add src/index.mjs README.md && git commit -m "feat: sequential multi-wallet runner + docs"
```

---

## Self-Review

**Spec coverage:**
- §3 HTTP API → Task 7 (config/session/status/claim) + Task 9 (startSession via browser). ✓
- §3 WS protocol (envelope, foundShare, verifyResult, closeSession, updateBalance/verify/error events) → Task 8 + Task 10. ✓
- §3 nickminer (wasm reuse, set_config mapping, nonce/preimage encoding, validity) → Tasks 1,2,3,10. ✓
- §4 hybrid captcha (browser detect provider+sitekey, multibot solve, inject, intercept startSession) → Tasks 6,9. ✓
- §5 modules → all mapped to tasks. ✓
- §6 per-wallet flow → Task 10. ✓
- §7 config/.env → Tasks 1,5. ✓
- §8 error handling (share INVALID retry-ish, per-wallet isolation) → Task 10 (share catch) + Task 11 (try/catch per wallet). Note: WS auto-reconnect/resume is simplified (loop catches; full reconnect deferred — acceptable for v0.1, documented).
- §9 security (secrets in .env, no logging) → Tasks 1,5,11. ✓
- §10 testing → unit tests Tasks 2-8,10; live Tasks 9,11. ✓
- §11 risks (wasm-load smoke, hashrate pacing, cliver config, captcha brittleness notes) → Tasks 1,10,5,9. ✓

**Placeholder scan:** No TBD/TODO; every code step has full code. Live-validation steps (9,11) reference concrete run commands, not vague instructions.

**Type consistency:** `paramsStr` (getPoWParamsStr) used identically in foundShare/verifyResult. `sessionInfo.modules.pow.preImage` → `preimageHex` → `setConfig` consistent. `nextNonceBudget` signature matches test. `mineWallet`/`startSessionViaBrowser`/`CaptchaSolver.solve` signatures consistent across tasks.

**Known simplification (documented):** WS reconnect/resume after mid-session drop is minimal in v0.1 (a drop fails the wallet, which is isolated and retryable by re-running). Full resume (re-`getSession`, resume `lastNonce`) is a fast follow if needed.
```

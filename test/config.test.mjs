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

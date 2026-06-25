import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.mjs";

const base = {
  FAUCET_CLIVER: "2.4.0",
  MULTIBOT_APIKEY: "key123",
  WALLET_1_ADDR: "0x1111111111111111111111111111111111111111",
  WALLET_1_PROXY: "http://u:p@1.2.3.4:8080",
  WALLET_2_ADDR: "0x2222222222222222222222222222222222222222",
};

test("defaults to sepolia faucet with derived ws url", () => {
  const cfg = loadConfig(base);
  assert.equal(cfg.faucets.length, 1);
  assert.equal(cfg.faucets[0].name, "sepolia");
  assert.equal(cfg.faucets[0].url, "https://sepolia-faucet.pk910.de");
  assert.equal(cfg.faucets[0].wsUrl, "wss://sepolia-faucet.pk910.de/ws/pow");
  assert.equal(cfg.faucets[0].cliver, "2.4.0");
});

test("selects multiple faucets with default urls", () => {
  const cfg = loadConfig({ ...base, FAUCETS: "sepolia,ephemery,hoodi" });
  assert.deepEqual(cfg.faucets.map((f) => f.name), ["sepolia", "ephemery", "hoodi"]);
  assert.equal(cfg.faucets[1].url, "https://ephemery-faucet.pk910.de");
  assert.equal(cfg.faucets[2].wsUrl, "wss://hoodi-faucet.pk910.de/ws/pow");
});

test("per-faucet URL override", () => {
  const cfg = loadConfig({ ...base, FAUCETS: "hoodi", HOODI_URL: "https://my-hoodi.example/" });
  assert.equal(cfg.faucets[0].url, "https://my-hoodi.example");
  assert.equal(cfg.faucets[0].wsUrl, "wss://my-hoodi.example/ws/pow");
});

test("parses wallets, proxies, threshold", () => {
  const cfg = loadConfig({ ...base, CLAIM_THRESHOLD_WEI: "50000000000000000" });
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

test("rejects unknown faucet without explicit url", () => {
  assert.throws(() => loadConfig({ ...base, FAUCETS: "goerli" }), /faucet "goerli"/);
});

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

test("startSession posts addr+captchaToken to cliver-tagged endpoint", async () => {
  const { calls, requestFn } = recorder({ session: "s1", modules: { pow: {} } });
  const api = new FaucetApi("https://ephemery-faucet.pk910.de", "2.4.0", requestFn);
  await api.startSession({ addr: "0xabc", captchaToken: "tok" });
  assert.match(calls[0].url, /\/api\/startSession\?cliver=2\.4\.0$/);
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { addr: "0xabc", captchaToken: "tok" });
});

test("non-JSON response throws readable status+snippet", async () => {
  const requestFn = async () => ({ statusCode: 504, body: { text: async () => "<html><head><title>504 Gateway Time-out</title></head></html>" } });
  const api = new FaucetApi("https://ephemery-faucet.pk910.de", "2.4.0", requestFn);
  await assert.rejects(() => api.startSession({ addr: "0xabc", captchaToken: "tok" }), /HTTP 504 non-JSON: <html>.*504 Gateway/);
});

test("claimReward posts session body", async () => {
  const { calls, requestFn } = recorder({ status: "claiming" });
  const api = new FaucetApi("https://sepolia-faucet.pk910.de", "2.4.0", requestFn);
  await api.claimReward("sess-1");
  assert.match(calls[0].url, /\/api\/claimReward$/);
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { session: "sess-1" });
});

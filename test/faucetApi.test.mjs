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

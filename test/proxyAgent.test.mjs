import { test } from "node:test";
import assert from "node:assert/strict";
import { httpDispatcher, wsAgent, playwrightProxy } from "../src/proxyAgent.mjs";
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

test("playwrightProxy splits inline credentials from server", () => {
  assert.equal(playwrightProxy(""), undefined);
  assert.deepEqual(playwrightProxy("http://1.2.3.4:8080"), { server: "http://1.2.3.4:8080" });
  assert.deepEqual(
    playwrightProxy("http://user:p%40ss@136.143.246.211:6860"),
    { server: "http://136.143.246.211:6860", username: "user", password: "p@ss" }
  );
});

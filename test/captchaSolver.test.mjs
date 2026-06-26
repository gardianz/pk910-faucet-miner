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

test("submit uses googlekey for recaptcha, sitekey otherwise", async () => {
  const urls = [];
  const rec = (url) => { urls.push(url); return { text: async () => "OK|1" }; };
  await new CaptchaSolver("k", rec).submit({ method: "userrecaptcha", sitekey: "RC", pageurl: "https://x" });
  await new CaptchaSolver("k", rec).submit({ method: "hcaptcha", sitekey: "HC", pageurl: "https://x" });
  assert.match(urls[0], /[?&]googlekey=RC(&|$)/);
  assert.ok(!/[?&]sitekey=/.test(urls[0]), "recaptcha must not send sitekey");
  assert.match(urls[1], /[?&]sitekey=HC(&|$)/);
});

test("default provider is multibot (host + balance action)", async () => {
  const urls = [];
  const rec = (url) => { urls.push(url); return { text: async () => "OK|1" }; };
  const s = new CaptchaSolver("k", rec);
  assert.equal(s.provider, "multibot");
  await s.submit({ method: "hcaptcha", sitekey: "H", pageurl: "https://x" });
  await s.balance();
  assert.match(urls[0], /^https:\/\/api\.multibot\.cloud\/in\.php\?/);
  assert.match(urls[1], /\/res\.php\?action=userinfo&/);
});

test("2captcha provider routes to 2captcha.com with getbalance", async () => {
  const urls = [];
  const rec = (url) => { urls.push(url); return { text: async () => "OK|1" }; };
  const s = new CaptchaSolver("k", rec, { provider: "2captcha" });
  await s.submit({ method: "userrecaptcha", sitekey: "RC", pageurl: "https://x" });
  await s.balance();
  assert.match(urls[0], /^https:\/\/2captcha\.com\/in\.php\?/);
  assert.match(urls[0], /[?&]googlekey=RC(&|$)/);
  assert.match(urls[1], /^https:\/\/2captcha\.com\/res\.php\?action=getbalance&/);
});

test("unknown provider throws", () => {
  assert.throws(() => new CaptchaSolver("k", undefined, { provider: "nope" }), /unknown captcha provider/);
});

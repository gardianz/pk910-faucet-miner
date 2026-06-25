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

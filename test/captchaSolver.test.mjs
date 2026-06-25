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

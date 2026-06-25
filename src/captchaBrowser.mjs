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

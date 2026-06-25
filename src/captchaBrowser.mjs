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

export async function startSessionViaBrowser({ faucetUrl, addr, proxy, solver, headless = true, timeoutMs = 180000, attempts = 3, solveTimeoutMs = 180000 }) {
  const launchOpts = { headless, args: ["--no-sandbox", "--disable-setuid-sandbox"] };
  if (proxy) launchOpts.proxy = { server: proxy };
  const browser = await chromium.launch(launchOpts);
  try {
    const page = await browser.newPage();

    // Single response listener; each attempt swaps in a fresh resolver. The captcha
    // provider (reCAPTCHA) is solver-side slow/flaky, so we retry the whole solve.
    let startSessionStatus = null;
    let resolveBody = () => {};
    page.on("response", async (resp) => {
      if (resp.url().includes("/api/startSession")) {
        startSessionStatus = resp.status();
        try { resolveBody(await resp.json()); } catch { resolveBody(null); }
      }
    });

    let lastErr;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await page.goto(faucetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.fill('input[type="text"], input[placeholder*="ddress"]', addr);
        await page.waitForSelector(
          'iframe[src*="hcaptcha.com"], iframe[src*="challenges.cloudflare.com"], iframe[src*="recaptcha"]',
          { timeout: 60000 }
        );
        const { provider, sitekey } = await detectProvider(page);
        if (!provider || !sitekey) throw new Error("captcha provider/sitekey not detected");

        const method = provider === "recaptcha" ? "userrecaptcha" : provider;
        const token = await solver.solve({ method, sitekey, pageurl: faucetUrl, proxy }, { timeoutMs: solveTimeoutMs, intervalMs: 5000 });

        if (provider === "recaptcha") {
          // patch grecaptcha on the already-loaded page so pk910's grecaptcha.execute()/getResponse() return our token.
          await page.evaluate((t) => {
            const ret = () => Promise.resolve(t);
            window.grecaptcha = { ready: (cb) => cb(), execute: ret, render: () => 0, getResponse: () => t };
          }, token);
        }
        await injectToken(page, provider, token);

        const bodyPromise = new Promise((r) => (resolveBody = r));
        await page.click('button:has-text("Start Mining"), button:has-text("Request"), button[type="submit"]');
        const sessionInfo = await Promise.race([
          bodyPromise,
          new Promise((r) => setTimeout(() => r({ _timeout: true }), 60000)),
        ]);
        if (sessionInfo && sessionInfo.session) return sessionInfo;
        throw new Error(`startSession failed (HTTP ${startSessionStatus}): ${JSON.stringify(sessionInfo)}`);
      } catch (e) {
        lastErr = e;
        if (attempt < attempts) continue; // reload + fresh captcha challenge on next iteration
      }
    }
    throw lastErr;
  } finally {
    await browser.close();
  }
}

// Browserless session start for faucets whose captcha is a DIRECT provider
// (hcaptcha / turnstile / recaptcha). No Chromium: solve the provider captcha via
// multibot and POST the raw token to /startSession.
//
// The pk910 "custom" wrapper (provider === "custom", e.g. sepolia/hoodi) binds the
// token to a browser fingerprint + challenge, so those still need startSessionViaBrowser.
export async function startSessionHttp({ api, faucetUrl, captcha, addr, proxy, solver, log = console }) {
  const method = captcha.provider === "recaptcha" ? "userrecaptcha" : captcha.provider;
  log.info?.(`  captcha=${captcha.provider} (direct, no browser) — solving via ${solver.provider} (bisa 1-5 menit)...`);
  const t0 = Date.now();
  let lastTick = 0;
  const token = await solver.solve(
    { method, sitekey: captcha.siteKey, pageurl: faucetUrl, proxy },
    { timeoutMs: 300000, intervalMs: 5000, onTick: (s) => { if (s - lastTick >= 30) { lastTick = s; log.info?.(`  ...masih menunggu solver (${s}s)`); } } }
  );
  log.info?.(`  captcha solved in ${Math.round((Date.now() - t0) / 1000)}s (token ${token.length} chars), starting session...`);
  const sessionInfo = await api.startSession({ addr, captchaToken: token }, proxy);
  if (!sessionInfo || !sessionInfo.session) {
    throw new Error(`startSession failed: ${JSON.stringify(sessionInfo).slice(0, 200)}`);
  }
  return sessionInfo;
}

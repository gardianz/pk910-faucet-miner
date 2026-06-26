import { ProxyAgent } from "undici";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

export function httpDispatcher(proxyUrl) {
  if (!proxyUrl) return undefined;
  return new ProxyAgent(proxyUrl);
}

export function wsAgent(proxyUrl) {
  if (!proxyUrl) return undefined;
  return proxyUrl.startsWith("socks") ? new SocksProxyAgent(proxyUrl) : new HttpsProxyAgent(proxyUrl);
}

// Playwright/Chromium ignores user:pass embedded in the proxy URL — credentials
// must be passed separately as { server, username, password }. (curl/undici DO
// parse inline creds, which is why those work while the browser silently 407s.)
export function playwrightProxy(proxyUrl) {
  if (!proxyUrl) return undefined;
  const u = new URL(proxyUrl);
  const out = { server: `${u.protocol}//${u.host}` };
  if (u.username) {
    out.username = decodeURIComponent(u.username);
    out.password = decodeURIComponent(u.password);
  }
  return out;
}

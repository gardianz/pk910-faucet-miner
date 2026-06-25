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

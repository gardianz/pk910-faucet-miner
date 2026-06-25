const BASE = "https://api.multibot.cloud";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class CaptchaSolver {
  constructor(apikey, fetchFn = (url) => fetch(url)) {
    this.apikey = apikey;
    this.fetchFn = fetchFn;
  }

  async _get(url) {
    const res = await this.fetchFn(url);
    return (await res.text()).trim();
  }

  // opts: { method, sitekey?, pageurl, proxy?, extra? }
  async submit({ method, sitekey, pageurl, proxy, extra = {} }) {
    const params = new URLSearchParams({ key: this.apikey, method, pageurl, json: "0", ...extra });
    if (sitekey) params.set("sitekey", sitekey);
    if (proxy) {
      params.set("proxy", proxy.replace(/^\w+:\/\//, ""));
      params.set("proxytype", proxy.startsWith("socks5") ? "SOCKS5" : "HTTP");
    }
    const res = await this._get(`${BASE}/in.php?${params.toString()}`);
    if (!res.startsWith("OK|")) throw new Error(`multibot submit failed: ${res}`);
    return res.slice(3);
  }

  async poll(id, { timeoutMs = 180000, intervalMs = 5000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await this._get(`${BASE}/res.php?key=${this.apikey}&action=get&id=${id}`);
      if (res === "CAPCHA_NOT_READY") { await sleep(intervalMs); continue; }
      if (res.startsWith("OK|")) return res.slice(3);
      throw new Error(`multibot poll failed: ${res}`);
    }
    throw new Error("multibot poll timeout");
  }

  async solve(opts, pollOpts = {}) {
    const id = await this.submit(opts);
    return this.poll(id, pollOpts);
  }

  async balance() {
    return this._get(`${BASE}/res.php?action=userinfo&key=${this.apikey}`);
  }
}

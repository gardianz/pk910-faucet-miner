import { request as undiciRequest } from "undici";
import { httpDispatcher } from "./proxyAgent.mjs";

export class FaucetApi {
  constructor(faucetUrl, cliver, requestFn = undiciRequest) {
    this.base = faucetUrl.replace(/\/$/, "") + "/api";
    this.cliver = cliver;
    this.requestFn = requestFn;
  }

  // Parse JSON but, on non-JSON (nginx/Cloudflare 5xx HTML, gateway timeouts),
  // throw a readable error with the HTTP status + a body snippet instead of a
  // cryptic "Unexpected token '<'".
  async _parse(res, path) {
    const text = await res.body.text();
    try {
      return JSON.parse(text);
    } catch {
      const snippet = text.replace(/\s+/g, " ").trim().slice(0, 160);
      throw new Error(`${path} -> HTTP ${res.statusCode} non-JSON: ${snippet}`);
    }
  }

  async _get(path, proxy) {
    const res = await this.requestFn(this.base + path, { dispatcher: httpDispatcher(proxy) });
    return this._parse(res, path);
  }

  async _post(path, body, proxy) {
    const res = await this.requestFn(this.base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      dispatcher: httpDispatcher(proxy),
    });
    return this._parse(res, path);
  }

  getFaucetConfig(proxy) { return this._get(`/getFaucetConfig?cliver=${encodeURIComponent(this.cliver)}`, proxy); }
  startSession(inputData, proxy) { return this._post(`/startSession?cliver=${encodeURIComponent(this.cliver)}`, inputData, proxy); }
  getSession(id, proxy) { return this._get(`/getSession?session=${encodeURIComponent(id)}`, proxy); }
  getSessionStatus(id, proxy) { return this._get(`/getSessionStatus?session=${encodeURIComponent(id)}&details=1`, proxy); }
  claimReward(id, proxy) { return this._post(`/claimReward`, { session: id }, proxy); }
}

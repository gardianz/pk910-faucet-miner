import { request as undiciRequest } from "undici";
import { httpDispatcher } from "./proxyAgent.mjs";

export class FaucetApi {
  constructor(faucetUrl, cliver, requestFn = undiciRequest) {
    this.base = faucetUrl.replace(/\/$/, "") + "/api";
    this.cliver = cliver;
    this.requestFn = requestFn;
  }

  async _get(path, proxy) {
    const res = await this.requestFn(this.base + path, { dispatcher: httpDispatcher(proxy) });
    return res.body.json();
  }

  async _post(path, body, proxy) {
    const res = await this.requestFn(this.base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      dispatcher: httpDispatcher(proxy),
    });
    return res.body.json();
  }

  getFaucetConfig(proxy) { return this._get(`/getFaucetConfig?cliver=${encodeURIComponent(this.cliver)}`, proxy); }
  getSession(id, proxy) { return this._get(`/getSession?session=${encodeURIComponent(id)}`, proxy); }
  getSessionStatus(id, proxy) { return this._get(`/getSessionStatus?session=${encodeURIComponent(id)}&details=1`, proxy); }
  claimReward(id, proxy) { return this._post(`/claimReward`, { session: id }, proxy); }
}

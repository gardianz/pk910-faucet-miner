import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { wsAgent } from "./proxyAgent.mjs";

export class WsClient extends EventEmitter {
  constructor({ wsUrl, sessionId, cliver, proxy }) {
    super();
    this.url = `${wsUrl}?session=${encodeURIComponent(sessionId)}&cliver=${encodeURIComponent(cliver)}`;
    this.proxy = proxy;
    this.sock = null;
    this.reqId = 1;
    this.pending = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.sock = new WebSocket(this.url, { agent: wsAgent(this.proxy) });
      this.sock.on("open", () => { this.emit("open"); resolve(); });
      this.sock.on("close", () => this.emit("close"));
      this.sock.on("error", (err) => { this.emit("error", { data: { code: "WS", message: String(err) } }); reject(err); });
      this.sock.on("message", (raw) => this._onMessage(raw));
    });
  }

  _onMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (Object.prototype.hasOwnProperty.call(msg, "rsp")) {
      const dfd = this.pending.get(msg.rsp);
      if (!dfd) return;
      this.pending.delete(msg.rsp);
      if (msg.action === "error") dfd.reject(new Error(`[${msg.data?.code}] ${msg.data?.message}`));
      else dfd.resolve(msg.data);
      return;
    }
    if (msg.action) this.emit(msg.action, msg);
  }

  sendRequest(action, data) {
    return new Promise((resolve, reject) => {
      if (!this.sock || this.sock.readyState !== WebSocket.OPEN) return reject(new Error("ws not open"));
      const id = this.reqId++;
      this.pending.set(id, { resolve, reject });
      const message = { id, action };
      if (data !== undefined) message.data = data;
      this.sock.send(JSON.stringify(message));
    });
  }

  sendMessage(action, data) {
    if (!this.sock || this.sock.readyState !== WebSocket.OPEN) throw new Error("ws not open");
    const message = { action };
    if (data !== undefined) message.data = data;
    this.sock.send(JSON.stringify(message));
  }

  close() {
    if (this.sock) { try { this.sock.close(); } catch {} this.sock = null; }
  }
}

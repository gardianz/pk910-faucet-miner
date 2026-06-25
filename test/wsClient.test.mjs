import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocketServer } from "ws";
import { WsClient } from "../src/wsClient.mjs";

function startServer(handler) {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port: 0 }, () => {
      resolve({ wss, port: wss.address().port });
    });
    wss.on("connection", (sock) => {
      sock.on("message", (raw) => handler(sock, JSON.parse(raw.toString())));
    });
  });
}

test("sendRequest resolves on matching rsp", async () => {
  const { wss, port } = await startServer((sock, msg) => {
    if (msg.action === "foundShare") sock.send(JSON.stringify({ rsp: msg.id, action: "ok", data: { accepted: true } }));
  });
  const client = new WsClient({ wsUrl: `ws://127.0.0.1:${port}/ws/pow`, sessionId: "s1", cliver: "2.4.0" });
  await client.connect();
  const res = await client.sendRequest("foundShare", { nonce: 1 });
  assert.deepEqual(res, { accepted: true });
  client.close(); wss.close();
});

test("sendRequest rejects on error action", async () => {
  const { wss, port } = await startServer((sock, msg) => {
    sock.send(JSON.stringify({ rsp: msg.id, action: "error", data: { code: "INVALID_SHARE", message: "bad" } }));
  });
  const client = new WsClient({ wsUrl: `ws://127.0.0.1:${port}/ws/pow`, sessionId: "s1", cliver: "2.4.0" });
  await client.connect();
  await assert.rejects(() => client.sendRequest("foundShare", {}), /INVALID_SHARE/);
  client.close(); wss.close();
});

test("emits server events by action", async () => {
  // server-initiated event: send on connection (no client message needed)
  const wss = new WebSocketServer({ port: 0 });
  await new Promise((r) => wss.on("listening", r));
  const port = wss.address().port;
  wss.on("connection", (sock) => {
    sock.send(JSON.stringify({ action: "updateBalance", data: { balance: "100", reason: "share" } }));
  });
  const client = new WsClient({ wsUrl: `ws://127.0.0.1:${port}/ws/pow`, sessionId: "s1", cliver: "2.4.0" });
  // register listener before connect to avoid missing an early event
  const gotEvent = new Promise((res) => client.on("updateBalance", (m) => res(m.data)));
  await client.connect();
  const data = await gotEvent;
  assert.equal(data.balance, "100");
  client.close(); wss.close();
});

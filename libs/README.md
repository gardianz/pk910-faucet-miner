# libs/

Vendored third-party libraries that are not published to npm.

## nickminer_wasm.cjs

Source: https://raw.githubusercontent.com/pk910/PoWFaucet/master/libs/nickminer_wasm.cjs

This is the pk910 PoWFaucet nickminer WASM module, pre-compiled and bundled as a CJS file.
Size: 445361 bytes.

### Node.js Compatibility

The module loads cleanly in Node 20+ via `createRequire`. No browser-global shims are required
because Node 20 already provides `atob`, `btoa`, and `fetch`. If running on Node < 20,
add the following shim at the top of your entry point:

```js
globalThis.atob ??= (b) => Buffer.from(b, "base64").toString("binary");
globalThis.btoa ??= (b) => Buffer.from(b, "binary").toString("base64");
```

### API

```ts
getNickMinerReadyPromise(): Promise<void>
getNickMiner(): {
  miner_init(): void;
  miner_set_config(seed: string, difficulty: string, rounds: number, startNonce: string, endNonce: string, threads: number, preimageHex: string): void;
  miner_run(nonceHex: string): string; // returns 0x-prefixed hash
}
```

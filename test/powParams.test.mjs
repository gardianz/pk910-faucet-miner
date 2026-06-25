import { test } from "node:test";
import assert from "node:assert/strict";
import { getPoWParamsStr, preimageHex, nonceHex } from "../src/powParams.mjs";

const params = { a: "nickminer", i: "f4f3d96484a7555bb0c87d329b73617977ca3ae37c5e6876c44dead410fd074a", r: "0539", v: 27, c: 100, s: "008282", p: "000000" };

test("getPoWParamsStr matches live nickminer format", () => {
  assert.equal(
    getPoWParamsStr(params, 13),
    "nickminer|f4f3d96484a7555bb0c87d329b73617977ca3ae37c5e6876c44dead410fd074a|0539|27|100|008282|000000|13"
  );
});

test("preimageHex decodes base64 to hex", () => {
  // base64 of bytes [0x00,0xff,0x10] => "AP8Q"
  assert.equal(preimageHex("AP8Q"), "00ff10");
});

test("nonceHex left-pads to 16 chars", () => {
  assert.equal(nonceHex(1), "0000000000000001");
  assert.equal(nonceHex(0xabcdef), "0000000000abcdef");
});

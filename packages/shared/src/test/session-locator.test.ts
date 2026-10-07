import { describe, expect, it } from "vitest";
import { decodeSessionLocator, encodeSessionLocator, InvalidSessionLocatorError } from "../session-locator";

declare const Buffer: { from(value: string, encoding?: string): { toString(encoding: string): string } };
const nodeKey = (hostId: string, sessionId: string) => `host:${Buffer.from(JSON.stringify([hostId, sessionId])).toString("base64url")}`;
const rawKey = (payload: string) => `host:${Buffer.from(payload).toString("base64url")}`;

describe("session locator", () => {
  it("round-trips a remote key and leaves local ids alone", () => {
    const key = encodeSessionLocator({ hostId: "server", sessionId: "session" });
    expect(key).toBe(nodeKey("server", "session"));
    expect(decodeSessionLocator(key)).toEqual({ hostId: "server", sessionId: "session" });
    expect(decodeSessionLocator("session-local")).toBeNull();
  });

  it.each([
    ["invalid base64", "host:***"],
    ["padded base64", `host:${btoa(JSON.stringify(["server", "session"]))}`],
    ["truncated base64", "host:a"],
    ["not JSON", rawKey("not json")],
    ["wrong length", rawKey(JSON.stringify(["server"]))],
    ["three parts", rawKey(JSON.stringify(["server", "session", "extra"]))],
    ["non-string part", rawKey(JSON.stringify(["server", 1]))],
    ["empty part", rawKey(JSON.stringify(["", "session"]))],
    ["too long", rawKey(JSON.stringify(["server", "s".repeat(129)]))],
    ["not canonical JSON", rawKey('[ "server", "session" ]')],
    ["empty payload", "host:"],
  ])("throws on %s", (_name, key) => {
    expect(() => decodeSessionLocator(key)).toThrow(InvalidSessionLocatorError);
  });

  it("accepts the maximum part length", () => {
    const ref = { hostId: "h".repeat(128), sessionId: "s".repeat(128) };
    expect(decodeSessionLocator(encodeSessionLocator(ref))).toEqual(ref);
  });

  it("matches Buffer base64url byte for byte on random input", () => {
    let seed = 20261006;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const pool = ["a", "Z", "0", "-", "_", ":", "/", "\"", "\\", " ", "é", "中", "文", "😀", "𝒳", "\u0000", "\n", " ", "\ud800"];
    const randomString = () => Array.from({ length: 1 + Math.floor(next() * 40) }, () => pool[Math.floor(next() * pool.length)]).join("");
    for (let index = 0; index < 200; index++) {
      const ref = { hostId: randomString(), sessionId: randomString() };
      const key = encodeSessionLocator(ref);
      expect(key).toBe(nodeKey(ref.hostId, ref.sessionId));
      if (ref.hostId.length <= 128 && ref.sessionId.length <= 128) expect(decodeSessionLocator(key)).toEqual(ref);
    }
  });
});

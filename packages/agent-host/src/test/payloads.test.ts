import { expect, it } from "vitest";
import { HostPayloads } from "../payloads.js";
it("reassembles immutable Unicode pages within the frame bound and releases completed transfers", () => {
  const pages = new HostPayloads(), json = JSON.stringify({ text: "中文🙂\u0001".repeat(100000) });
  const ref = pages.retain(json); let restored = "";
  for (let part = 0; part < ref.parts; part++) {
    const value = pages.read(ref.id, part);
    expect(Buffer.byteLength(JSON.stringify(value))).toBeLessThan(1024 * 1024);
    restored += value.text;
  }
  expect(restored).toBe(json);
  expect(() => pages.read(ref.id, 0)).toThrow("expired");
  expect(() => new HostPayloads().read(ref.id, 0)).toThrow("expired");
});
it("bounds retained data and expires abandoned pages", () => {
  let now = 0; const pages = new HostPayloads(() => now);
  const ref = pages.retain("x".repeat(5 * 1024 * 1024));
  expect(() => pages.retain("x".repeat(5 * 1024 * 1024))).toThrow("budget");
  now = 30000;
  expect(() => pages.read(ref.id, 0)).toThrow("expired");
  expect(pages.retain("x".repeat(5 * 1024 * 1024)).parts).toBeGreaterThan(1);
});

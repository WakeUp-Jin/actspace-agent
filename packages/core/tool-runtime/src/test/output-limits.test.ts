import { describe, expect, it } from "vitest";
import { sliceWholeChars } from "../output-limits.js";

describe("sliceWholeChars", () => {
  it("returns short text unchanged and cuts long text at the limit", () => {
    expect(sliceWholeChars("abc", 3)).toBe("abc");
    expect(sliceWholeChars("abcdef", 3)).toBe("abc");
    expect(sliceWholeChars("abc", 0)).toBe("");
  });
  it("drops a high surrogate that the cut would leave without its pair", () => {
    expect(sliceWholeChars("a🌱b", 2)).toBe("a");
    expect(sliceWholeChars("a🌱b", 3)).toBe("a🌱");
    expect(sliceWholeChars("🌱🌱", 1)).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import { formatApproxTokens, formatShare, formatSignedTokens, formatTokenCount } from "../context-format";

describe("context-format", () => {
  it("formats token counts with K / M and drops trailing .0", () => {
    expect(formatTokenCount(0)).toBe("0");
    expect(formatTokenCount(999)).toBe("999");
    expect(formatTokenCount(1_000)).toBe("1K");
    expect(formatTokenCount(12_340)).toBe("12.3K");
    expect(formatTokenCount(1_000_000)).toBe("1M");
    expect(formatTokenCount(1_820_000)).toBe("1.8M");
    expect(formatTokenCount(-5)).toBe("0");
  });

  it("prefixes estimates with ≈", () => {
    expect(formatApproxTokens(86_400)).toBe("≈86.4K");
  });

  it("signs deltas with + and U+2212 and hides zero", () => {
    expect(formatSignedTokens(1_400)).toBe("+1.4K");
    expect(formatSignedTokens(-540)).toBe("−540");
    expect(formatSignedTokens(0)).toBe("");
  });

  it("formats shares with a <1% floor and a dash for unknown totals", () => {
    expect(formatShare(43, 100)).toBe("43%");
    expect(formatShare(1, 1_000)).toBe("<1%");
    expect(formatShare(0, 100)).toBe("0%");
    expect(formatShare(5, 0)).toBe("—");
  });
});

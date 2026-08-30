import { describe, expect, it } from "vitest";
import { providerCodeFromUnknown, retryAfterMsFromUnknown } from "../failure.js";

describe("LLM structured failure helpers", () => {
  it("parses Retry-After seconds, HTTP dates, and explicit millisecond fields", () => {
    expect(retryAfterMsFromUnknown({ retryAfterMs: 1250 })).toBe(1250);
    expect(retryAfterMsFromUnknown({ retryAfter: "2" })).toBe(2000);
    expect(retryAfterMsFromUnknown({ headers: { "retry-after": "3" } })).toBe(3000);
    expect(retryAfterMsFromUnknown({ headers: new Headers({ "retry-after": "4" }) })).toBe(4000);
  });

  it("preserves provider codes from public SDK error shapes", () => {
    expect(providerCodeFromUnknown({ code: "rate_limit_exceeded" })).toBe("rate_limit_exceeded");
    expect(providerCodeFromUnknown({ error: { code: "overloaded" } })).toBe("overloaded");
    expect(providerCodeFromUnknown({ message: "no code" })).toBeUndefined();
  });
});

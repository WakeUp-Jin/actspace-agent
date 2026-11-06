import { describe, expect, it } from "vitest";
import { withOpencodeSessionHeader } from "../opencode-session.js";

const headers = { Authorization: "Bearer k" };

describe("withOpencodeSessionHeader", () => {
  it("adds the session header on an OpenCode endpoint", () => {
    expect(withOpencodeSessionHeader(headers, "https://opencode.ai/inference/go/openai/v1", "session-1"))
      .toEqual({ Authorization: "Bearer k", "x-opencode-session": "session-1" });
  });

  it("leaves other providers untouched", () => {
    expect(withOpencodeSessionHeader(headers, "https://openrouter.ai/api/v1", "session-1")).toBe(headers);
    expect(withOpencodeSessionHeader(undefined, "https://api.deepseek.com", "session-1")).toBeUndefined();
  });

  it("needs a session to key by", () => {
    expect(withOpencodeSessionHeader(headers, "https://opencode.ai/inference/go/openai/v1", undefined)).toBe(headers);
    expect(withOpencodeSessionHeader(headers, "https://opencode.ai/inference/go/openai/v1", "")).toBe(headers);
  });
});

import { describe, expect, it } from "vitest";
import { normalizeCustomConnectionAddress } from "../custom-connection-address";

describe("custom connection address", () => {
  it("strips a trailing /v1 for Anthropic and keeps the site root", () => {
    expect(normalizeCustomConnectionAddress("https://a.com/v1", "anthropic-messages")).toEqual({
      ok: true,
      baseUrl: "https://a.com",
      requestUrl: "https://a.com/v1/messages",
      strippedSuffixes: ["/v1"],
      inferredProtocol: null,
    });
  });

  it("infers Anthropic from a pasted /v1/messages endpoint", () => {
    expect(normalizeCustomConnectionAddress("https://a.com/v1/messages", "openai-completions")).toMatchObject({
      ok: true,
      baseUrl: "https://a.com",
      requestUrl: "https://a.com/v1/messages",
      strippedSuffixes: ["/v1/messages"],
      inferredProtocol: "anthropic-messages",
    });
  });

  it("infers OpenAI Chat from /chat/completions and keeps the /v1 layer", () => {
    expect(normalizeCustomConnectionAddress("https://a.com/v1/chat/completions", "anthropic-messages")).toMatchObject({
      ok: true,
      baseUrl: "https://a.com/v1",
      requestUrl: "https://a.com/v1/chat/completions",
      inferredProtocol: "openai-completions",
    });
  });

  it("infers OpenAI Responses from /responses", () => {
    expect(normalizeCustomConnectionAddress("https://a.com/v1/responses", "openai-completions")).toMatchObject({
      ok: true,
      baseUrl: "https://a.com/v1",
      requestUrl: "https://a.com/v1/responses",
      inferredProtocol: "openai-responses",
    });
  });

  it("leaves an OpenAI base path untouched", () => {
    expect(normalizeCustomConnectionAddress("https://a.com/api/v1", "openai-completions")).toEqual({
      ok: true,
      baseUrl: "https://a.com/api/v1",
      requestUrl: "https://a.com/api/v1/chat/completions",
      strippedSuffixes: [],
      inferredProtocol: null,
    });
  });

  it("tolerates repeated trailing slashes", () => {
    expect(normalizeCustomConnectionAddress("  https://a.com/v1///  ", "anthropic-messages")).toMatchObject({ ok: true, baseUrl: "https://a.com" });
    expect(normalizeCustomConnectionAddress("https://a.com/v1/messages//", "anthropic-messages")).toMatchObject({ ok: true, baseUrl: "https://a.com" });
    expect(normalizeCustomConnectionAddress("https://a.com/", "openai-completions")).toMatchObject({ ok: true, baseUrl: "https://a.com" });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["ftp://a.com", "scheme"],
    ["https://u:p@a.com", "credentials"],
    ["not a url", "invalid"],
  ])("rejects %j as %s", (raw, reason) => {
    expect(normalizeCustomConnectionAddress(raw, "anthropic-messages")).toEqual({ ok: false, reason });
  });
});

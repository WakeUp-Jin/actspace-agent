import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmAdapterDispatchInput, LlmStreamEvent } from "@actspace/llm-service";
import { PiAiAdapter } from "../pi-ai-adapter.js";
import type { PiAiConnectionOptions } from "../pi-ai-stream.js";
import { TIMEOUT_PATTERN } from "../transport-failure.js";

const request = (): LlmAdapterDispatchInput => ({
  request: { requestId: "timeout", routeId: "fixture", model: "fixture", messages: [{ role: "user", content: "hi" }], tools: [], options: {} },
  credential: { apiKey: "fixture-key" }, signal: new AbortController().signal,
});
afterEach(() => vi.unstubAllGlobals());

function loaded(stream: () => AsyncIterable<unknown>): NonNullable<PiAiConnectionOptions["load"]> {
  return async () => ({
    core: { createProvider: () => ({ id: "fixture" }), createModels: () => ({ setProvider: () => {}, getModel: () => ({ id: "fixture", provider: "fixture" }), streamSimple: stream }) },
    api: { stream: () => {}, streamSimple: () => {} },
  }) as never;
}
async function collect(adapter: PiAiAdapter): Promise<LlmStreamEvent[]> {
  const events: LlmStreamEvent[] = [];
  for await (const event of await adapter.dispatch(request())) events.push(event);
  return events;
}

describe("timeout wording", () => {
  it.each(["Request timed out.", "request timeout", "connect time-out", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "Timed out"])("recognises %s", text => {
    expect(TIMEOUT_PATTERN.test(text)).toBe(true);
  });
  it("does not match unrelated text", () => { expect(TIMEOUT_PATTERN.test("Connection error.")).toBe(false); });
});

describe("pi-ai transport failures", () => {
  it("classifies an SDK 'Request timed out.' terminal as a retryable timeout and names the host", async () => {
    const adapter = new PiAiAdapter({ wire: { providerId: "custom", route: "openai-completions", baseUrl: "https://cn.aiapi.bot/v1", load: loaded(async function* () {
      yield { type: "error", error: { content: [], stopReason: "error", errorMessage: "Request timed out." } };
    }) } });
    const failure = (await collect(adapter)).at(-1);
    expect(failure).toMatchObject({ type: "error", failure: { kind: "timeout", retryable: true, message: expect.stringContaining("cn.aiapi.bot") } });
    expect((failure as { failure: { message: string } }).failure.message).toContain("Request timed out.");
    expect((failure as { failure: { message: string } }).failure.message).toContain("请检查网络或中转站");
  });

  it("keeps real SDK timeouts retryable and names the relay host", async () => {
    const cause = Object.assign(new Error("Connect Timeout Error"), { code: "UND_ERR_CONNECT_TIMEOUT" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed", { cause }); }));
    const adapter = new PiAiAdapter({ wire: { providerId: "custom", route: "openai-completions", baseUrl: "https://cn.aiapi.bot/v1" } });
    const failure = (await collect(adapter)).at(-1);
    expect(failure).toMatchObject({ type: "error", failure: { retryable: true, kind: "timeout", message: expect.stringContaining("cn.aiapi.bot") } });
  });

  it("classifies a thrown timeout (not just a terminal event)", async () => {
    const adapter = new PiAiAdapter({ wire: { providerId: "custom", route: "openai-completions", baseUrl: "https://relay.example", load: loaded(() => { throw new Error("Request timed out."); }) } });
    await expect(adapter.dispatch(request()).then(async source => { for await (const _ of source) { /* drain */ } })).rejects.toMatchObject({ failure: { kind: "timeout", retryable: true } });
  });
});

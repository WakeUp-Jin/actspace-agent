import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolExecutionContext } from "@actspace/tool-runtime";
import { createNodeDeepSearchPorts, DEEP_SEARCH_ENDPOINT, DEEP_SEARCH_SYSTEM_PROMPT, type NodeDeepSearchPortsOptions } from "../node-ports.js";
import { fixture, streamOf } from "./helpers.js";

const KEY = "fixture-ds-key-0001";

function context(signal = new AbortController().signal) {
  const progress: string[] = [];
  const value = { callId: "call-1", sessionId: "s", signal, reportProgress: ({ message }: { message: string }) => { progress.push(message); } } as unknown as ToolExecutionContext;
  return { context: value, progress };
}

function sse(body: string | ReadableStream<Uint8Array>, init: ResponseInit = {}) {
  return new Response(typeof body === "string" ? streamOf([body]) : body, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" }, ...init });
}

function ports(fetchImpl: typeof fetch, options: Partial<NodeDeepSearchPortsOptions> = {}) {
  const deepSearch = createNodeDeepSearchPorts({ apiKey: () => KEY, available: () => true, fetchImpl, ...options }).deep_search;
  if (!deepSearch) throw new Error("deep_search port missing");
  return deepSearch;
}

const chunk = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const contentChunk = (text: string) => chunk({ choices: [{ index: 0, delta: { content: text }, finish_reason: null }], usage: null });
const finishChunk = (reason = "stop") => chunk({ choices: [{ index: 0, delta: {}, finish_reason: reason }], usage: null });
const everyText = (result: Awaited<ReturnType<ReturnType<typeof ports>>>, progress: readonly string[]) => JSON.stringify(result) + progress.join("\n");

/** A body that emits the given pieces on a timer and only closes when cancelled. */
function timedStream(pieces: readonly { atMs: number; text: string }[]) {
  const cancel = vi.fn();
  const timers: ReturnType<typeof setTimeout>[] = [];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) timers.push(setTimeout(() => { try { controller.enqueue(new TextEncoder().encode(piece.text)); } catch { /* closed */ } }, piece.atMs));
    },
    cancel(reason) { timers.forEach(clearTimeout); cancel(reason); },
  });
  return { stream, cancel };
}

afterEach(() => { vi.useRealTimers(); });

describe("createNodeDeepSearchPorts", () => {
  it("sends the contract request and assembles the recorded stream", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => sse(fixture("search-and-read")));
    const { context: ctx, progress } = context();
    const result = await ports(fetchImpl)({ question: "  2025 年中国新能源车销量？ " }, ctx);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(DEEP_SEARCH_ENDPOINT);
    expect(DEEP_SEARCH_ENDPOINT).toBe("https://api.deepseek.com/chat/completions");
    expect(init).toMatchObject({ method: "POST", redirect: "error" });
    expect(new Headers(init!.headers).get("authorization")).toBe(`Bearer ${KEY}`);
    expect(new Headers(init!.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init!.body))).toEqual({
      model: "deepseek-flash",
      stream: true,
      stream_options: { include_usage: true },
      thinking: { type: "enabled" },
      tools: [{ type: "deepseek_web_search" }],
      messages: [{ role: "system", content: DEEP_SEARCH_SYSTEM_PROMPT }, { role: "user", content: "2025 年中国新能源车销量？" }],
    });
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    expect(result).toMatchObject({ status: "completed", summary: "3 searches · 7 sources" });
    expect(result.detail?.[0]?.label).toBe("deep-search");
    expect(progress).toEqual(["searching 3 queries", "reading 1 page", "reading 2 pages", "reading 3 pages", "reading 4 pages", "summarizing"]);
    expect(everyText(result, progress)).not.toContain(KEY);
  });

  it("reads the key on every call and does not request without one", async () => {
    let key: string | undefined = "fixture-ds-first";
    const fetchImpl = vi.fn<typeof fetch>(async () => sse(fixture("no-search")));
    const port = ports(fetchImpl, { apiKey: () => key });
    await port({ question: "q" }, context().context);
    key = "fixture-ds-second";
    await port({ question: "q" }, context().context);
    expect(fetchImpl.mock.calls.map(([, init]) => new Headers(init!.headers).get("authorization"))).toEqual(["Bearer fixture-ds-first", "Bearer fixture-ds-second"]);
    key = "  ";
    const result = await port({ question: "q" }, context().context);
    expect(result).toMatchObject({ status: "failed", failure: { code: "DEEP_SEARCH_UNAVAILABLE", retryable: false } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not request when the switch is off", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await ports(fetchImpl, { available: () => false })({ question: "q" }, context().context);
    expect(result).toMatchObject({ status: "failed", failure: { code: "DEEP_SEARCH_UNAVAILABLE" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects blank or overlong questions without requesting", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    for (const question of ["   ", "x".repeat(4001), 3]) {
      expect(await ports(fetchImpl)({ question } as never, context().context)).toMatchObject({ status: "failed", failure: { code: "INVALID_ARGUMENTS" } });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [401, "Authentication Fails", "DEEPSEEK_AUTH_FAILED", false],
    [402, "Insufficient Balance", "DEEPSEEK_INSUFFICIENT_BALANCE", false],
    [429, "Rate limit reached", "DEEPSEEK_RATE_LIMITED", true],
    [400, "Content Exists Risk", "DEEPSEEK_CONTENT_RISK", false],
    [400, "Invalid request", "DEEP_SEARCH_FAILED", false],
    [500, "Internal Server Error", "DEEP_SEARCH_FAILED", true],
    [503, "Service Unavailable", "DEEP_SEARCH_FAILED", true],
  ])("maps HTTP %i (%s) to %s", async (status, message, code, retryable) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ error: { message: `${message} Bearer ${KEY}`, type: "x" } }), { status, headers: { "content-type": "application/json" } }));
    const result = await ports(fetchImpl)({ question: "q" }, context().context);
    expect(result).toMatchObject({ status: "failed", failure: { code, retryable } });
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(result.detail).toBeUndefined();
  });

  it("keeps DeepSeek's message for other statuses, redacted and cut to 500 characters", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ error: { message: `api_key ${KEY} ${"y".repeat(900)}` } }), { status: 422 }));
    const result = await ports(fetchImpl)({ question: "q" }, context().context);
    expect(result.failure?.message).toContain("HTTP 422");
    expect(result.failure?.message).toContain("[REDACTED]");
    expect(result.failure?.message).not.toContain(KEY);
    expect(result.failure!.message.length).toBeLessThan(600);
  });

  it("fails when the response is not an event stream", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    expect(await ports(fetchImpl)({ question: "q" }, context().context)).toMatchObject({ status: "failed", failure: { code: "DEEP_SEARCH_FAILED", retryable: false } });
  });

  it("fails on a transport error without leaking the key", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => { throw new TypeError(`fetch failed for Bearer ${KEY}`); });
    const result = await ports(fetchImpl)({ question: "q" }, context().context);
    expect(result).toMatchObject({ status: "failed", failure: { code: "DEEP_SEARCH_FAILED", retryable: true } });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("fails on an error chunk mid-stream, a stream cut before finish_reason, and an empty answer", async () => {
    const cases: [string, string, boolean][] = [
      [contentChunk("partial") + chunk({ error: { message: "upstream exploded" } }), "DEEP_SEARCH_FAILED", false],
      [contentChunk("partial"), "DEEP_SEARCH_FAILED", true],
      [contentChunk("x") + finishChunk("content_filter"), "DEEPSEEK_CONTENT_RISK", false],
      [finishChunk("stop") + "data: [DONE]\n\n", "DEEP_SEARCH_FAILED", false],
    ];
    for (const [body, code, retryable] of cases) {
      const result = await ports(vi.fn<typeof fetch>(async () => sse(body)))({ question: "q" }, context().context);
      expect(result).toMatchObject({ status: "failed", failure: { code, retryable } });
      expect(JSON.stringify(result)).not.toContain("partial");
    }
  });

  it("stops reading after an error chunk without waiting for [DONE]", async () => {
    const { stream, cancel } = timedStream([{ atMs: 0, text: chunk({ error: { message: "boom" } }) }]);
    const result = await ports(vi.fn<typeof fetch>(async () => sse(stream)), { idleTimeoutMs: 5_000 })({ question: "q" }, context().context);
    expect(result.failure?.code).toBe("DEEP_SEARCH_FAILED");
    expect(cancel).toHaveBeenCalled();
  });

  it("times out when only keep-alive comments arrive", async () => {
    const { stream, cancel } = timedStream([{ atMs: 5, text: ": keep-alive\n\n" }, { atMs: 20, text: ": keep-alive\n\n" }, { atMs: 35, text: ": keep-alive\n\n" }]);
    let seenSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => { seenSignal = init!.signal!; return sse(stream); });
    const result = await ports(fetchImpl, { idleTimeoutMs: 30, totalTimeoutMs: 5_000 })({ question: "q" }, context().context);
    expect(result).toMatchObject({ status: "failed", failure: { code: "DEEP_SEARCH_IDLE_TIMEOUT", retryable: true } });
    expect(seenSignal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalled();
  });

  it("keeps going while data arrives but stops at the total limit", async () => {
    const pieces = Array.from({ length: 20 }, (_, index) => ({ atMs: 10 + index * 15, text: contentChunk("x") }));
    const { stream, cancel } = timedStream(pieces);
    const result = await ports(vi.fn<typeof fetch>(async () => sse(stream)), { idleTimeoutMs: 40, totalTimeoutMs: 120 })({ question: "q" }, context().context);
    expect(result).toMatchObject({ status: "failed", failure: { code: "DEEP_SEARCH_TIMEOUT", retryable: true } });
    expect(cancel).toHaveBeenCalled();
  });

  it("times out while waiting for the response headers", async () => {
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
    }));
    const result = await ports(fetchImpl, { idleTimeoutMs: 30, totalTimeoutMs: 5_000 })({ question: "q" }, context().context);
    expect(result.failure?.code).toBe("DEEP_SEARCH_IDLE_TIMEOUT");
  });

  it("returns TOOL_ABORTED when the caller aborts, cancelling the request and the reader", async () => {
    const controller = new AbortController();
    const { stream, cancel } = timedStream([{ atMs: 5, text: contentChunk("partial") }]);
    let seenSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => { seenSignal = init!.signal!; return sse(stream); });
    setTimeout(() => controller.abort(), 20);
    const result = await ports(fetchImpl, { idleTimeoutMs: 5_000 })({ question: "q" }, context(controller.signal).context);
    expect(result).toMatchObject({ status: "failed", failure: { code: "TOOL_ABORTED", retryable: false } });
    expect(seenSignal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalled();
    expect(stream.locked).toBe(false);
  });

  it("returns TOOL_ABORTED without requesting when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn<typeof fetch>();
    expect(await ports(fetchImpl)({ question: "q" }, context(controller.signal).context)).toMatchObject({ failure: { code: "TOOL_ABORTED" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports progress only when it changes", async () => {
    const event = (value: unknown) => chunk({ choices: [{ index: 0, delta: {}, server_tool_event: value, finish_reason: null }], usage: null });
    const body = [
      event({ type: "call_started", step: 0, call: { index: 0, action: { type: "search", queries: ["a"] } } }),
      event({ type: "call_started", step: 0, call: { index: 1, action: { type: "find_in_page" } } }),
      contentChunk("A"), contentChunk("B"), finishChunk(), "data: [DONE]\n\n",
    ].join("");
    const { context: ctx, progress } = context();
    const result = await ports(vi.fn<typeof fetch>(async () => sse(body)))({ question: "q" }, ctx);
    expect(progress).toEqual(["searching 1 query", "summarizing"]);
    expect(result).toMatchObject({ status: "completed", summary: "0 searches · 0 sources" });
  });
});

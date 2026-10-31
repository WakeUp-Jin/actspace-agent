import { describe, expect, it, vi } from "vitest";
import { EMPTY_LLM_USAGE, type LlmService, type LlmStreamEvent } from "@actspace/llm-service";
import { createLlmImageInspector, createNodeToolPorts } from "../node-ports.js";

const parent = { sessionId: "session", agentRunId: "run", turnId: "turn", stepId: "step", callId: "tool-call" };
const input = { ...parent, artifactId: "image", mediaType: "image/png", question: "What is visible?", signal: new AbortController().signal };
const usage = { ...EMPTY_LLM_USAGE, inputTokens: 80, outputTokens: 20, cacheReadTokens: 10, source: "provider-reported" as const };
const done: LlmStreamEvent = { type: "done", content: [{ type: "text", text: "A bird." }], stopReason: "stop", usage };
const failure = { kind: "rate-limit" as const, message: "Try later", retryable: true, attempt: 1 };

function fixture(attempts: readonly (readonly LlmStreamEvent[] | Error)[] = [[done]]) {
  const order: string[] = [];
  const finish = vi.fn(async () => { order.push("finish"); });
  const start = vi.fn(async () => { order.push("start"); return { finish }; });
  const release = vi.fn();
  let index = 0;
  const dispatch = vi.fn(async function* () {
    order.push("dispatch");
    const events = attempts[index++]!;
    if (events instanceof Error) throw events;
    yield* events;
  });
  const prepare = vi.fn(() => ({ request: { requestId: `request-${index + 1}`, routeId: "resolved-route", model: "actual-vision" }, dispatch, release }));
  const options = { llm: { prepare } as unknown as LlmService, routeId: "configured-route", model: "configured-model", recorder: { start } };
  return { options, start, finish, dispatch, release, order, prepare };
}

describe("image inspection auxiliary request lifecycle", () => {
  it("records the prepared identity and parent before dispatch, then provider usage before returning", async () => {
    const f = fixture();
    await expect(createLlmImageInspector(f.options)(input)).resolves.toBe("A bird.");
    expect(f.order).toEqual(["start", "dispatch", "finish"]);
    expect(f.start).toHaveBeenCalledWith(expect.objectContaining({ ...parent, logicalRequestId: expect.any(String), attemptId: "request-1", attempt: 1, purpose: "image-inspection", routeId: "resolved-route", model: "actual-vision" }));
    expect(f.finish).toHaveBeenCalledExactlyOnceWith({ status: "completed", usage });
  });

  it("does not dispatch until the durable start barrier resolves", async () => {
    const f = fixture();
    let unblock!: () => void;
    f.start.mockImplementationOnce(async () => { await new Promise<void>(resolve => { unblock = resolve; }); return { finish: f.finish }; });
    const pending = createLlmImageInspector(f.options)(input);
    await vi.waitFor(() => expect(f.start).toHaveBeenCalledOnce());
    expect(f.dispatch).not.toHaveBeenCalled();
    unblock();
    await pending;
  });

  it("releases the prepared lease and refuses dispatch if start persistence fails", async () => {
    const f = fixture();
    f.start.mockRejectedValueOnce(new Error("start flush failed"));
    await expect(createLlmImageInspector(f.options)(input)).rejects.toThrow("start flush failed");
    expect(f.dispatch).not.toHaveBeenCalled();
    expect(f.release).toHaveBeenCalledOnce();
  });

  it.each([
    ["failed", [{ type: "error", failure, usage }], "Try later", usage],
    ["aborted", [{ type: "aborted", reason: "cancelled", usage }], "cancelled", usage],
    ["failed", new Error("transport failed"), "transport failed", EMPTY_LLM_USAGE],
    ["failed", [], "without a terminal", EMPTY_LLM_USAGE],
  ] as const)("settles %s exactly once and preserves known or unknown usage", async (status, events, message, expectedUsage) => {
    const f = fixture([events as readonly LlmStreamEvent[] | Error]);
    await expect(createLlmImageInspector(f.options)(input)).rejects.toThrow(message);
    expect(f.finish).toHaveBeenCalledExactlyOnceWith({ status, usage: expectedUsage });
  });

  it("keeps explicit zero and missing fields distinct", async () => {
    const partial = { ...EMPTY_LLM_USAGE, inputTokens: 0, source: "provider-reported" as const };
    const f = fixture([[{ ...done, usage: partial }]]);
    await createLlmImageInspector(f.options)(input);
    expect(f.finish).toHaveBeenCalledExactlyOnceWith({ status: "completed", usage: partial });
  });

  it("does not retry a terminal flush or report success when it fails", async () => {
    const f = fixture();
    f.finish.mockRejectedValueOnce(new Error("end flush failed"));
    await expect(createLlmImageInspector(f.options)(input)).rejects.toThrow("end flush failed");
    expect(f.finish).toHaveBeenCalledOnce();
    expect(f.dispatch).toHaveBeenCalledOnce();
  });

  it("records retries as separate attempts of one logical request", async () => {
    const f = fixture([[{ type: "error", failure, usage }], [done]]);
    const inspect = createLlmImageInspector({ ...f.options, retryPolicy: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0, shouldRetry: () => true } });
    await expect(inspect(input)).resolves.toBe("A bird.");
    expect(f.start).toHaveBeenCalledTimes(2);
    const [first, second] = f.start.mock.calls.map(call => call[0] as unknown as Record<string, unknown>);
    expect(first).toMatchObject({ attemptId: "request-1", attempt: 1 });
    expect(second).toMatchObject({ attemptId: "request-2", attempt: 2, logicalRequestId: first!.logicalRequestId });
    expect(f.finish.mock.calls).toEqual([[{ status: "failed", usage }], [{ status: "completed", usage }]]);
  });
});

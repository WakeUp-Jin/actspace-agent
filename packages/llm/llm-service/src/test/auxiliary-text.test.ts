import { describe, expect, it, vi } from "vitest";
import { completeAuxiliaryText } from "../auxiliary-text.js";
import { EMPTY_LLM_USAGE } from "../usage.js";
import type { PreparedLlmCall } from "../prepared-call.js";

const owner = { sessionId: "s", purpose: "session-title" as const };
const zero = { ...EMPTY_LLM_USAGE, inputTokens: 0, outputTokens: 0, source: "provider-reported" as const };
function fixture(events: unknown[] = [], signal?: AbortSignal) {
  const release = vi.fn(), dispatch = vi.fn(async () => (async function* () { for (const event of events) yield event; })());
  const finish = vi.fn(async (_result: unknown) => {}), start = vi.fn(async (_input: unknown) => ({ finish }));
  const prepared = { request: { requestId: "actual-id", routeId: "actual-route", model: "actual-model" }, dispatch, release } as unknown as PreparedLlmCall;
  return { prepared, release, dispatch, finish, start, run: () => completeAuxiliaryText(prepared, { owner, recorder: { start }, ...(signal ? { signal } : {}) }) };
}
describe("durable auxiliary text transport", () => {
  it("waits for start persistence, uses resolved identity and retains explicit zero", async () => {
    const f = fixture([{ type: "done", usage: zero, stopReason: "stop", content: [{ type: "text", text: "title" }] }]);
    let persist!: () => void;
    f.start.mockImplementationOnce(() => new Promise(resolve => { persist = () => resolve({ finish: f.finish }); }));
    const task = f.run();
    expect(f.dispatch).not.toHaveBeenCalled();
    persist();
    expect(await task).toMatchObject({ text: "title", usage: zero });
    expect(f.start).toHaveBeenCalledWith({ ...owner, attempt: 1, attemptId: "actual-id", logicalRequestId: "actual-id", routeId: "actual-route", model: "actual-model" });
    expect(f.finish).toHaveBeenCalledExactlyOnceWith({ status: "completed", usage: zero });
    expect(f.release).toHaveBeenCalledOnce();
  });
  it("does not dispatch when the start cannot persist", async () => {
    const f = fixture(); f.start.mockRejectedValueOnce(new Error("disk full"));
    await expect(f.run()).rejects.toThrow("disk full");
    expect(f.dispatch).not.toHaveBeenCalled(); expect(f.finish).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledOnce();
  });
  it("propagates terminal persistence failure without appending again", async () => {
    const f = fixture([{ type: "done", usage: zero, content: [] }]); f.finish.mockRejectedValueOnce(new Error("flush failed"));
    await expect(f.run()).rejects.toThrow("flush failed"); expect(f.finish).toHaveBeenCalledOnce(); expect(f.release).toHaveBeenCalledOnce();
  });
  it.each([
    { events: [], status: "failed", usage: EMPTY_LLM_USAGE },
    { events: [{ type: "error", failure: { message: "provider failure" }, usage: zero }], status: "failed", usage: zero },
    { events: [{ type: "aborted", reason: "cancelled", usage: zero }], status: "aborted", usage: zero },
  ])("records $status without replacing missing usage with zero", async ({ events, status, usage }) => {
    const f = fixture(events); await expect(f.run()).rejects.toThrow();
    expect(f.finish).toHaveBeenCalledExactlyOnceWith({ status, usage });
  });
  it("records cancellation when an aborted stream ends without a terminal event", async () => {
    const controller = new AbortController(); controller.abort(); const f = fixture([], controller.signal);
    await expect(f.run()).rejects.toThrow(); expect(f.finish).toHaveBeenCalledExactlyOnceWith({ status: "aborted", usage: EMPTY_LLM_USAGE });
  });
});

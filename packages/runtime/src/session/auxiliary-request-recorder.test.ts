import { describe, expect, it, vi } from "vitest";
import { createCoreCodecRegistry, createSessionHeader, type SessionEventCandidateV1 } from "@actspace/session-journal";
import { SessionHandle } from "@actspace/session-persistence";
import { EMPTY_LLM_USAGE } from "@actspace/llm-service";
import { createAuxiliaryRequestRecorder } from "./auxiliary-request-recorder.js";

const input = { sessionId: "session", agentRunId: "run", turnId: "turn", stepId: "step", callId: "call", logicalRequestId: "logical", attemptId: "attempt", attempt: 1, purpose: "image-inspection" as const, routeId: "route", model: "vision" };
async function setup() {
  const registry = createCoreCodecRegistry();
  const header = createSessionHeader({ sessionId: "session", createdAt: "2026-10-23T00:00:00Z", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "actspace.runtime.v2", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } });
  const flush = vi.fn(async (_seq: number) => {});
  const session = SessionHandle.createEphemeral({ header, registry, onFlush: seq => flush(seq) });
  const append = (type: string, data: SessionEventCandidateV1["data"]) => session.append({ type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null });
  await append("turn/start", { turnId: "turn", agentRunId: "run" });
  await append("step/start", { turnId: "turn", stepId: "step" });
  await append("tool/call", { callId: "call", name: "inspect_image" });
  return { session, flush, recorder: createAuxiliaryRequestRecorder({ getOpen: id => id === "session" ? session : undefined }, () => "2026-10-23T00:00:01.000Z") };
}
describe("Runtime auxiliary persistence barriers", () => {
  it("durably records background work without creating a Run, Turn or conversation node", async () => {
    const f = await setup();
    const append = (type: string, data: SessionEventCandidateV1["data"]) => f.session.append({ type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null });
    await append("tool/result", { callId: "call", name: "inspect_image", status: "completed" });
    await append("step/end", { turnId: "turn", stepId: "step" });
    await append("turn/end", { turnId: "turn" });
    const floor = f.session.journal.lastSeq;
    for (const purpose of ["session-title", "compaction"] as const) {
      const attempt = await f.recorder.start({ sessionId: "session", purpose, logicalRequestId: purpose, attemptId: `${purpose}-1`, attempt: 1, routeId: "utility", model: "background-model" });
      await attempt.finish({ status: "completed", usage: EMPTY_LLM_USAGE });
    }
    const facts = f.session.journal.events.filter(event => event.seq > floor);
    expect(facts.map(event => event.type)).toEqual(["llm/auxiliary-start", "llm/auxiliary-end", "llm/auxiliary-start", "llm/auxiliary-end"]);
    expect(facts.every(event => event.surface === null && !("agentRunId" in (event.data as Record<string, unknown>)) && !("turnId" in (event.data as Record<string, unknown>)))).toBe(true);
    expect(f.flush).toHaveBeenLastCalledWith(f.session.journal.lastSeq);
  });
  it("awaits the start flush before exposing an attempt", async () => {
    const f = await setup();
    let release!: () => void;
    f.flush.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    let resolved = false;
    const pending = f.recorder.start(input).then(attempt => { resolved = true; return attempt; });
    await vi.waitFor(() => expect(f.flush).toHaveBeenCalledWith(3));
    expect(resolved).toBe(false);
    release();
    await pending;
    expect(resolved).toBe(true);
  });
  it("awaits one terminal flush and shares the first result between duplicate finish calls", async () => {
    const f = await setup();
    const attempt = await f.recorder.start(input);
    let release!: () => void;
    f.flush.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const finish = attempt.finish({ status: "completed", usage: { ...EMPTY_LLM_USAGE, inputTokens: 0, outputTokens: 12, source: "provider-reported" } });
    expect(attempt.finish({ status: "failed", usage: EMPTY_LLM_USAGE })).toBe(finish);
    let resolved = false;
    void finish.then(() => { resolved = true; });
    await vi.waitFor(() => expect(f.flush).toHaveBeenLastCalledWith(4));
    expect(resolved).toBe(false);
    release(); await finish;
    expect(f.session.journal.events.filter(event => event.type === "llm/auxiliary-end").map(event => event.data)).toEqual([{ ...input, startedAt: "2026-10-23T00:00:01.000Z", finishedAt: "2026-10-23T00:00:01.000Z", status: "completed", usage: { ...EMPTY_LLM_USAGE, inputTokens: 0, outputTokens: 12, source: "provider-reported" } }]);
  });
  it("rejects a failed start checkpoint before dispatch can obtain a handle", async () => {
    const f = await setup();
    f.flush.mockRejectedValueOnce(new Error("start checkpoint failed"));
    await expect(f.recorder.start(input)).rejects.toThrow("start checkpoint failed");
    expect(f.session.journal.events.filter(event => event.type === "llm/auxiliary-end")).toHaveLength(0);
  });
  it("never appends a second terminal after the first checkpoint fails", async () => {
    const f = await setup();
    const attempt = await f.recorder.start(input);
    f.flush.mockRejectedValueOnce(new Error("terminal checkpoint failed"));
    const first = attempt.finish({ status: "aborted", usage: EMPTY_LLM_USAGE });
    await expect(first).rejects.toThrow("terminal checkpoint failed");
    expect(attempt.finish({ status: "completed", usage: EMPTY_LLM_USAGE })).toBe(first);
    await expect(first).rejects.toThrow("terminal checkpoint failed");
    expect(f.session.journal.events.filter(event => event.type === "llm/auxiliary-end")).toHaveLength(1);
  });
  it("rejects a missing or mismatched owner instead of resuming a live Session", async () => {
    const f = await setup();
    await expect(f.recorder.start({ ...input, sessionId: "other" })).rejects.toThrow("live owning Session");
    await expect(createAuxiliaryRequestRecorder({ getOpen: () => f.session }).start({ ...input, sessionId: "other" })).rejects.toThrow("live owning Session");
    expect(f.flush).not.toHaveBeenCalled();
  });
});

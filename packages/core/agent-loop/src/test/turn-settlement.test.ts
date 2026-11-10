import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry, createSessionHeader } from "@actspace/session-journal";
import { SessionHandle } from "@actspace/session-persistence";
import { EMPTY_LLM_USAGE, type LlmMessage, type LlmStreamEvent } from "@actspace/llm-service";
import { runToolStreamFixture } from "../testing.js";

/** 回合里一条记录没写进去时，已经开始的请求和工具调用要被了结，回合照常结束，下一个回合还能跑。 */
describe("AgentLoop turn settlement after a record cannot be written", () => {
  it("ends the turn and keeps the session usable when a tool result is rejected", async () => {
    let firstTurn: unknown;
    let executions = 0;
    const requests: (readonly LlmMessage[])[] = [];
    const { result, journal } = await runToolStreamFixture({
      // 日志拒绝带凭据字段名的记录，所以这条 tool/result 写不进去。
      execute: async () => { executions += 1; return { status: "completed", summary: "Read", modelOutput: [{ type: "json", value: { password: "hunter2" } }] }; },
      onLoop: async (loop) => { firstTurn = await loop.runTurn({ content: "Read the secret file" }).catch((error: unknown) => error); },
      onMessages: (messages) => requests.push(messages),
    });

    expect(firstTurn).toBeInstanceOf(Error);
    expect((firstTurn as Error).message).toContain("forbidden secret field");
    expect(executions).toBe(1);
    const types = journal.map((event) => event.type);
    const settled = types.indexOf("recovery/start");
    expect(types.slice(settled, settled + 5)).toEqual(["recovery/start", "tool/recovery-outcome", "recovery/committed", "step/end", "turn/end"]);
    expect(journal[settled + 1].data).toMatchObject({ callId: "read-1", outcome: "outcome-unknown", retryAllowed: false });
    expect(journal[settled + 3].data).toMatchObject({ reason: "interrupted" });
    expect(journal[settled + 4].data).toMatchObject({ reason: "failed", failure: { message: expect.stringContaining("forbidden secret field") } });

    expect(result).toMatchObject({ reason: "completed" });
    expect(types.filter((type) => type === "turn/start")).toHaveLength(2);
    expect(types.at(-1)).toBe("turn/end");
    const feedback = requests.at(-1)?.find((message) => message.role === "tool" && message.callId === "read-1");
    expect(JSON.stringify(feedback)).toContain("no result was durable");
  });

  it("ends the turn when the request context record is rejected", async () => {
    const registry = createCoreCodecRegistry();
    const session = SessionHandle.createEphemeral({ registry, header: createSessionHeader({ sessionId: "context-rejected", createdAt: "2026-11-10T00:00:00.000Z", lineage: null,
      createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } }) });
    const append = session.append.bind(session);
    let rejected = false;
    session.append = (candidate) => {
      if (candidate.type !== "request/context" || rejected) return append(candidate);
      rejected = true;
      return Promise.reject(new Error("Session record exceeds the 1 MiB JSON limit."));
    };
    let firstTurn: unknown;
    let dispatched = 0;
    const { result, journal } = await runToolStreamFixture({ session, terminalOnly: true, onRequest: () => { dispatched += 1; },
      onLoop: async (loop) => { firstTurn = await loop.runTurn({ content: "First" }).catch((error: unknown) => error); } });

    expect((firstTurn as Error).message).toContain("1 MiB");
    const types = journal.map((event) => event.type);
    const settled = types.indexOf("recovery/start");
    expect(types.slice(settled, settled + 6)).toEqual(["recovery/start", "request/context", "assistant/message", "recovery/committed", "step/end", "turn/end"]);
    expect(journal[settled + 2].data).toMatchObject({ finishReason: "aborted", recovery: "outcome-unknown" });
    expect(journal[settled + 2].surface).toBeNull();
    expect(journal[settled + 5].data).toMatchObject({ reason: "failed" });
    // 第一个回合的请求没有发出去；第二个回合正常发出并结束。
    expect(dispatched).toBe(1);
    expect(result).toMatchObject({ reason: "completed", finalText: "Done." });
  });

  it("keeps the session usable after an assistant message too large for one record", async () => {
    let turns = 0;
    let firstTurn: unknown;
    const oversized = "x".repeat(1_100_000);
    const { result, journal } = await runToolStreamFixture({
      stream: () => (async function* (): AsyncGenerator<LlmStreamEvent> {
        const text = turns === 1 ? oversized : "Done.";
        yield { type: "done", stopReason: "stop", usage: EMPTY_LLM_USAGE, content: [{ type: "text", text }] };
      })(),
      onLoop: async (loop) => { turns = 1; firstTurn = await loop.runTurn({ content: "Write a very long answer" }).catch((error: unknown) => error); turns = 2; } });

    expect(firstTurn).toBeInstanceOf(Error);
    expect((firstTurn as Error).message).toContain("1 MiB");
    const types = journal.map((event) => event.type);
    const settled = types.indexOf("recovery/start");
    expect(types.slice(settled, settled + 5)).toEqual(["recovery/start", "assistant/message", "recovery/committed", "step/end", "turn/end"]);
    // 了结用的助手消息是空的，那条超大的消息没有进会话。
    expect(JSON.stringify(journal).length).toBeLessThan(100_000);
    expect(journal[settled + 4].data).toMatchObject({ reason: "failed" });
    expect(result).toMatchObject({ reason: "completed", finalText: "Done." });
  });

  it("ends the turn when a hook throws while a request is open", async () => {
    let turns = 0;
    let firstTurn: unknown;
    const { result, journal } = await runToolStreamFixture({
      stream: () => (async function* (): AsyncGenerator<LlmStreamEvent> {
        if (turns === 1) { yield { type: "error", failure: { kind: "unknown", message: "provider failed", retryable: false, attempt: 1 } }; return; }
        yield { type: "text-delta", text: "Done." };
        yield { type: "done", stopReason: "stop", usage: EMPTY_LLM_USAGE, content: [{ type: "text", text: "Done." }] };
      })(),
      context: {
        get: () => ({ flush: async () => {} }),
        waterfall: async (type, _payload, next) => {
          if (turns === 1 && type === "agent/request-error") throw new Error("request-error hook failed");
          return (next as () => Promise<object>)();
        },
      },
      onLoop: async (loop) => { turns = 1; firstTurn = await loop.runTurn({ content: "First" }).catch((error: unknown) => error); turns = 2; } });

    expect((firstTurn as Error).message).toContain("request-error hook failed");
    const types = journal.map((event) => event.type);
    const settled = types.indexOf("recovery/start");
    expect(types.slice(settled, settled + 5)).toEqual(["recovery/start", "assistant/message", "recovery/committed", "step/end", "turn/end"]);
    expect(result).toMatchObject({ reason: "completed", finalText: "Done." });
  });

  it("leaves no recovery records on an ordinary failed turn", async () => {
    let journal: readonly { readonly type: string }[] = [];
    await expect(runToolStreamFixture({ retryPolicy: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 },
      stream: () => (async function* () { yield { type: "error" as const, failure: { kind: "unknown" as const, message: "provider failed", retryable: false, attempt: 1 } }; })(),
      onJournal: (events) => { journal = events; } })).rejects.toThrow("provider failed");
    const types = journal.map((event) => event.type);
    expect(types.some((type) => type.startsWith("recovery/"))).toBe(false);
    expect(types.slice(-3)).toEqual(["assistant/message", "step/end", "turn/end"]);
  });
});

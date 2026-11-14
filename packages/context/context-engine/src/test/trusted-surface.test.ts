import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry, SessionJournal, surfaceViewVersion, type SessionEventCandidateV1, type SessionSurfaceView } from "@actspace/session-journal";
import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import { ContextEngine } from "../engine.js";
import { ContextInstanceRegistry } from "../instances.js";
import { projectContext } from "../projection.js";
import { ContextReducerRegistry } from "../reducers.js";
import { ContextSourceRegistry } from "../registry.js";
import type { ContextSession } from "../supplements.js";
import type { Context, ContextRequest } from "../types.js";

// agent-spec-context-trusted-surface.md §6：已信任对话不复制、兼容路径照旧检查、版本号驱动 contextRevision。

const source = { ownerPluginId: "@actspace/core" } as const;
const request: ContextRequest = { sessionId: "s", logicalAgentScopeId: "main", turnId: "t", stepId: "step-1", requestId: "r1", routeId: "route", model: "model", options: { reasoning: true } };

function candidate(type: string, data: RuntimeJsonValue, extra: Partial<SessionEventCandidateV1> = {}): SessionEventCandidateV1 {
  return { type, eventVersion: 1, source, data, surface: null, ...extra };
}

function journal(): SessionJournal {
  const value = new SessionJournal({ registry: createCoreCodecRegistry(), now: () => "2026-11-07T12:00:00.000Z" });
  value.append(candidate("turn/start", { turnId: "t" }));
  value.append(candidate("step/start", { turnId: "t", stepId: "step-1" }));
  value.append(candidate("user/message", { messageId: "u1", content: [{ type: "text", text: "hello" }] }, { surface: { kind: "append" } }));
  value.append(candidate("assistant/message", { messageId: "a1", content: [{ type: "text", text: "hi" }, { type: "tool-call", callId: "c1", name: "read_file", arguments: { path: "/a" } }] }, { surface: { kind: "append" } }));
  value.append(candidate("tool/call", { callId: "c1", name: "read_file" }));
  value.append(candidate("tool/result", { callId: "c1", name: "read_file", status: "completed", modelOutput: "file body" }, { surface: { kind: "append" } }));
  return value;
}

function session(value: SessionJournal): ContextSession {
  return { header: { sessionId: "s" }, get lastSeq() { return value.lastSeq; }, get durableSeq() { return value.lastSeq; }, journal: value,
    append: async (next: SessionEventCandidateV1) => value.append(next), flush: async () => undefined } as unknown as ContextSession;
}

function base(input: ContextRequest, conversation: SessionSurfaceView, throughJournalSeq: number): Context {
  return { request: input, content: { system: { sections: [{ id: "id", owner: "system", order: 0, content: "System." }], modelFacts: [] }, conversation, supplements: [], tools: [] },
    status: { throughJournalSeq, cycle: 0, paths: [], facts: [], plugins: {} } };
}

function engineFor(value: SessionJournal, instances = new ContextInstanceRegistry()) {
  const sources = new ContextSourceRegistry();
  sources.register({ id: "conversation", owner: "conversation", order: 0, criticality: "required", fields: ["conversation"],
    cacheKey: context => surfaceViewVersion(context.content.conversation), get: (context, write) => write({ conversation: context.content.conversation }) });
  return new ContextEngine({ session: session(value), sources, reducers: new ContextReducerRegistry(), instances, resolve: input => base(input, value.surface, value.lastSeq) });
}

describe("trusted Surface in the Context engine", () => {
  it("references the Journal's nodes through getContext, reconcile, toLlmInput and projection", async () => {
    const value = journal();
    const instances = new ContextInstanceRegistry();
    const first = await engineFor(value, instances).getContext(request);
    expect(first.content.conversation).toBe(value.surface);
    const reconciled = await engineFor(value, instances).reconcile({ ...request, requestId: "r2", stepId: "step-2" }, value.lastSeq);
    expect(reconciled.content.conversation).toBe(value.surface);
    reconciled.content.conversation.entries.forEach((entry, index) => { expect(entry.node).toBe(value.surface.entries[index].node); });
    expect(projectContext(reconciled).content.conversation).toBe(value.surface);

    const input = await engineFor(value, instances).toLlmInput(reconciled);
    // 用户消息的文字块原样来自日志节点。
    const user = input.messages.find(message => message.role === "user")!;
    expect(Object.isFrozen(input.messages)).toBe(true);
    expect(Object.isFrozen(user)).toBe(true);
    expect(Object.isFrozen(user.content)).toBe(true);
    expect(() => (input.messages as unknown as unknown[]).push({})).toThrow();
    expect(input.messages.map(message => message.role)).toEqual(["system", "user", "assistant", "tool"]);
  });

  it("still detaches, freezes and validates a conversation built by the caller", async () => {
    const value = journal();
    const legacy = { replaceGeneration: 0, entries: value.surface.entries.map(entry => ({ node: { ...entry.node }, sourceEventSeqs: [] as number[] })) };
    const engine = new ContextEngine({ resolve: input => base(input, legacy, value.lastSeq) });
    const context = await engine.getContext(request);
    expect(context.content.conversation).not.toBe(legacy);
    expect(context.content.conversation.entries[0].node).not.toBe(legacy.entries[0].node);
    expect(Object.isFrozen(context.content.conversation.entries[0].node)).toBe(true);

    const secret = { replaceGeneration: 0, entries: [{ node: { kind: "user", messageId: "u", content: { text: "x", apiKey: "sk-123" } }, sourceEventSeqs: [] }] } as unknown as SessionSurfaceView;
    await expect(new ContextEngine({ resolve: input => base(input, secret, 0) }).getContext(request)).rejects.toThrow(/forbidden field apiKey/);
  });

  it("does not trust a look-alike conversation object", async () => {
    const value = journal();
    const real = value.surface;
    const impostor = Object.freeze({ replaceGeneration: real.replaceGeneration, entries: Object.freeze([...real.entries]) });
    const context = await new ContextEngine({ resolve: input => base(input, impostor, value.lastSeq) }).getContext(request);
    expect(context.content.conversation).not.toBe(impostor);
    expect(context.content.conversation.entries[0].node).not.toBe(real.entries[0].node);
    expect(context.content.conversation).toEqual(impostor);
  });

  it("rejects a secret field in a source-produced supplement or tool without copying the conversation", async () => {
    const value = journal();
    const sources = new ContextSourceRegistry();
    sources.register({ id: "tools", owner: "tools", order: 0, criticality: "required", fields: ["tools"],
      get: (_, write) => write({ tools: [{ name: "x", definitionVersion: 1, definitionDigest: "d", description: "x", inputSchema: { type: "object", authorization: "Bearer s" } }] }) });
    const engine = new ContextEngine({ session: session(value), sources, resolve: input => base(input, value.surface, value.lastSeq) });
    await expect(engine.getContext(request)).rejects.toThrow(/Required context source tools failed/);
  });

  it("lets the conversation version alone decide contextRevision when nothing else changes", async () => {
    const value = journal();
    const instances = new ContextInstanceRegistry();
    // 固定 throughJournalSeq，只让对话变化：revision 是否加 1 只取决于对话的版本号。
    const engine = new ContextEngine({ instances, resolve: input => base(input, value.surface, 0) });
    const first = (await engine.getContext(request)).status.contextRevision!;
    expect((await engine.getContext({ ...request, requestId: "r2" })).status.contextRevision).toBe(first);
    value.append(candidate("user/message", { messageId: "u2", content: "more" }, { surface: { kind: "append" } }));
    expect((await engine.getContext({ ...request, requestId: "r3" })).status.contextRevision).toBe(first + 1);
  });

  it("advances contextRevision on append and compaction replace, not on a new request id", async () => {
    const value = journal();
    const instances = new ContextInstanceRegistry();
    const revision = async (requestId: string) => (await engineFor(value, instances).reconcile({ ...request, requestId }, value.lastSeq)).status.contextRevision;
    const first = await revision("r1");
    expect(await revision("r2")).toBe(first);
    value.append(candidate("user/message", { messageId: "u2", content: "more" }, { surface: { kind: "append" } }));
    const appended = await revision("r3");
    expect(appended).toBe(first! + 1);
    value.append(candidate("compaction/start", { compactionId: "k", start: 0, end: 3 }));
    value.append(candidate("compaction/summary", { compactionId: "k", summaryDigest: "d" }));
    value.append(candidate("surface/replaced", { compactionId: "k", sourceEventSeqs: [2, 3, 5], replacedTokens: { conversation: 0, summarizedConversation: 0 }, estimatorVersion: "t", node: { kind: "user", messageId: "sum", content: "summary" } }, {
      provenance: { sourceEventSeqs: [2, 3, 5], contributorIds: ["c"], runtimeSelectionSeq: null }, surface: { kind: "replace", start: 0, end: 3, sourceEventSeqs: [2, 3, 5] },
    }));
    value.append(candidate("compaction/end", { compactionId: "k", summaryDigest: "d" }));
    expect(await revision("r4")).toBe(appended! + 1);
    expect(await revision("r5")).toBe(appended! + 1);
  });
});

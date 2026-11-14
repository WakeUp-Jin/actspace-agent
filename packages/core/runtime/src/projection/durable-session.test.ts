import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry, createSessionHeader, SessionJournal } from "@actspace/session-journal";
import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import { SessionReadModel } from "./durable-session.js";

describe("durable usage summary", () => {
  it("keeps the live contextEstimate identical to a cold replay", () => {
    const codecs = createCoreCodecRegistry();
    const header = createSessionHeader({
      sessionId: "context",
      createdAt: "2026-09-07T00:00:00Z",
      lineage: null,
      createdWith: {
        profileId: "fixture",
        runtimeContractVersion: "1",
        manifestDigest: "fixture",
        plugins: [],
        codecSetDigest: codecs.digest,
      },
    });
    const journal = new SessionJournal({ registry: codecs });
    const append = (type: string, data: RuntimeJsonValue) =>
      journal.append({ type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null });
    append("turn/start", { turnId: "t" });
    append("step/start", { turnId: "t", stepId: "s" });
    journal.append({
      type: "user/message",
      eventVersion: 1,
      source: { ownerPluginId: "@actspace/core" },
      data: { messageId: "u", content: "hello" },
      surface: { kind: "append" },
    });
    append("request/header", { requestId: "r", turnId: "t", stepId: "s", contextWindow: 1000 });
    append("request/system-prompt", {
      requestId: "r",
      turnId: "t",
      stepId: "s",
      digest: "p",
      sections: [{ owner: "actspace.context-system", id: "core", order: 0, content: "be helpful" }],
      modelFacts: [],
      contributorProvenance: [],
    });
    append("request/tools", {
      requestId: "r",
      turnId: "t",
      stepId: "s",
      digest: "t",
      tools: [{ name: "read", description: "read a file", inputSchema: {} }],
    });
    append("request/context", { requestId: "r", turnId: "t", stepId: "s", snapshot: { schemaVersion: 3 } });
    for (let i = 0; i < 10; i++)
      append("assistant/chunk", {
        requestId: "r",
        messageId: "a",
        chunkIndex: i,
        chunk: { type: "text-delta", text: "hello" },
      });
    journal.append({
      type: "assistant/message",
      eventVersion: 1,
      source: { ownerPluginId: "@actspace/core" },
      data: { messageId: "a", requestId: "r", content: "final" },
      surface: { kind: "append" },
    });
    const live = new SessionReadModel(header, codecs);
    for (const [index, event] of journal.events.entries()) {
      live.apply(event);
      const cold = new SessionReadModel(header, codecs).replay(journal.events.slice(0, index + 1));
      expect(live.projections.value(header.sessionId, "contextEstimate")).toEqual(
        cold.projections.value(header.sessionId, "contextEstimate"),
      );
    }
    expect(live.projections.value(header.sessionId, "contextEstimate")).toMatchObject({
      contextWindow: 1000,
      requestId: "r",
      buckets: { systemPrompt: expect.any(Number), tools: expect.any(Number), conversation: expect.any(Number) },
    });
  });

  it("pushes contextEstimate only when the estimate changes, frozen and shared instead of copied", () => {
    const codecs = createCoreCodecRegistry();
    const header = createSessionHeader({
      sessionId: "context-changes",
      createdAt: "2026-09-07T00:00:00Z",
      lineage: null,
      createdWith: {
        profileId: "fixture",
        runtimeContractVersion: "1",
        manifestDigest: "fixture",
        plugins: [],
        codecSetDigest: codecs.digest,
      },
    });
    const journal = new SessionJournal({ registry: codecs });
    const model = new SessionReadModel(header, codecs);
    const append = (type: string, data: RuntimeJsonValue) =>
      model.apply(
        journal.append({ type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null }),
      );
    expect(Object.keys(append("turn/start", { turnId: "t" })?.values ?? {})).not.toContain("contextEstimate");
    expect(Object.keys(append("step/start", { turnId: "t", stepId: "s" })?.values ?? {})).not.toContain(
      "contextEstimate",
    );
    const header1 = append("request/header", { requestId: "r", turnId: "t", stepId: "s", contextWindow: 1000 });
    const pushed = header1?.values.contextEstimate as Record<string, unknown>;
    expect(pushed).toMatchObject({ requestId: "r", contextWindow: 1000 });
    expect(Object.isFrozen(pushed)).toBe(true);
    expect(
      Object.keys(
        append("request/context", { requestId: "r", turnId: "t", stepId: "s", snapshot: { schemaVersion: 3 } })
          ?.values ?? {},
      ),
    ).not.toContain("contextEstimate");
    for (let i = 0; i < 5; i++)
      expect(
        Object.keys(
          append("assistant/chunk", { requestId: "r", messageId: "a", chunkIndex: i, content: "x" })?.values ?? {},
        ),
      ).not.toContain("contextEstimate");
    expect(
      (model.projections.value(header.sessionId, "contextEstimate") as Record<string, unknown>).throughJournalSeq,
    ).toBe(pushed.throughJournalSeq);
  });

  it("counts terminal copies once and distinguishes historical zero from a verified free request", () => {
    const registry = createCoreCodecRegistry();
    const header = createSessionHeader({
      sessionId: "usage",
      createdAt: "2026-09-07T00:00:00Z",
      lineage: null,
      createdWith: {
        profileId: "fixture",
        runtimeContractVersion: "1",
        manifestDigest: "fixture",
        plugins: [],
        codecSetDigest: registry.digest,
      },
    });
    const journal = new SessionJournal({ registry });
    const append = (type: string, data: RuntimeJsonValue) =>
      journal.append({ type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null });
    const usage = {
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 50,
      cacheWriteTokens: 0,
      reasoningTokens: 10,
      cost: 0,
      costCurrency: "USD",
    };
    append("turn/start", { turnId: "t" });
    append("step/start", { turnId: "t", stepId: "s" });
    append("request/header", { requestId: "r", turnId: "t", stepId: "s" });
    append("request/context", { requestId: "r", turnId: "t", stepId: "s", messages: [] });
    append("assistant/message", { messageId: "a", requestId: "r", content: "done", usage });
    append("step/end", { turnId: "t", stepId: "s", status: "completed", usage });
    const snapshot = () => new SessionReadModel(header, registry).replay(journal.events).snapshot();
    expect(snapshot().usage).toMatchObject({ inputTokens: 100, outputTokens: 20, totalTokens: 170, costUsd: null });
    append("step/start", { turnId: "t", stepId: "s2" });
    append("request/header", { requestId: "r2", turnId: "t", stepId: "s2" });
    append("request/context", { requestId: "r2", turnId: "t", stepId: "s2", messages: [] });
    append("assistant/message", {
      messageId: "a2",
      requestId: "r2",
      content: "free",
      usage: { ...usage, costProvenance: { version: 1, basis: "estimated", reason: null, pricingSnapshot: null } },
    });
    expect(snapshot().usage).toMatchObject({ totalTokens: 340, costUsd: 0 });
  });
});

describe("Agent mode recovery", () => {
  it("keeps a legacy Chat Session in Chat despite an internal agent turn mode", () => {
    const registry = createCoreCodecRegistry();
    const header = createSessionHeader({
      sessionId: "legacy-chat",
      createdAt: "2026-09-07T00:00:00Z",
      lineage: null,
      createdWith: {
        profileId: "fixture",
        presetId: "actspace.chat",
        runtimeContractVersion: "1",
        manifestDigest: "fixture",
        plugins: [],
        codecSetDigest: registry.digest,
      },
    });
    const journal = new SessionJournal({ registry });
    journal.append({
      type: "turn/start",
      eventVersion: 1,
      source: { ownerPluginId: "@actspace/core" },
      data: { turnId: "legacy", mode: "agent" },
      surface: null,
    });
    expect(new SessionReadModel(header, registry).replay(journal.events).snapshot()).toMatchObject({
      agentFormId: "actspace.main",
      agentMode: "chat",
      agentModeRevision: 0,
    });
  });

  it("replays a mode event and keeps it in the cold snapshot", () => {
    const registry = createCoreCodecRegistry();
    const header = createSessionHeader({
      sessionId: "mode",
      createdAt: "2026-09-07T00:00:00Z",
      cwd: "/workspace",
      lineage: null,
      createdWith: {
        profileId: "fixture",
        presetId: "actspace.main",
        initialAgentMode: "chat",
        runtimeContractVersion: "1",
        manifestDigest: "fixture",
        plugins: [],
        codecSetDigest: registry.digest,
      },
    });
    const journal = new SessionJournal({ registry });
    journal.append({
      type: "agent/mode-set",
      eventVersion: 1,
      source: { ownerPluginId: "@actspace/core" },
      data: { mode: "plan", revision: 1 },
      surface: null,
    });
    expect(new SessionReadModel(header, registry).replay(journal.events).snapshot()).toMatchObject({
      agentMode: "plan",
      agentModeRevision: 1,
    });
  });
});

it.each([undefined, "auto", "manual", "session"] as const)(
  "replays tool audit without requiring new fields (%s)",
  (approvalMode) => {
    const registry = createCoreCodecRegistry();
    const header = createSessionHeader({
      sessionId: "audit",
      createdAt: "2026-10-18T00:00:00Z",
      lineage: null,
      createdWith: {
        profileId: "fixture",
        runtimeContractVersion: "1",
        manifestDigest: "fixture",
        plugins: [],
        codecSetDigest: registry.digest,
      },
    });
    const journal = new SessionJournal({ registry });
    const append = (type: string, data: RuntimeJsonValue) =>
      journal.append({ type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null });
    append("turn/start", { turnId: "t" });
    append("step/start", { turnId: "t", stepId: "s" });
    append("tool/call", { callId: "c", name: "bash", args: { command: "ls" } });
    append("tool/result", {
      callId: "c",
      name: "bash",
      status: "failed",
      ...(approvalMode ? { approvalMode, approvalReason: "fixture explanation" } : {}),
    });
    const tool = new SessionReadModel(header, registry).replay(journal.events).snapshot().tools[0];
    expect(tool?.approvalMode).toBe(approvalMode);
    expect(tool?.approvalReason).toBe(approvalMode ? "fixture explanation" : undefined);
  },
);

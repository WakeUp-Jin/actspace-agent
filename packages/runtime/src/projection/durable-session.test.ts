import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry, createSessionHeader, SessionJournal } from "@actspace/session-journal";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import { projectSessionSnapshot } from "./durable-session.js";

describe("durable usage summary", () => {
  it("counts terminal copies once and distinguishes historical zero from a verified free request", () => {
    const registry = createCoreCodecRegistry();
    const header = createSessionHeader({ sessionId: "usage", createdAt: "2026-09-07T00:00:00Z", lineage: null, createdWith: { profileId: "fixture", runtimeContractVersion: "1", manifestDigest: "fixture", plugins: [], codecSetDigest: registry.digest } });
    const journal = new SessionJournal({ registry });
    const append = (type: string, data: RuntimeV2JsonValue) => journal.append({ type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null });
    const usage = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 50, cacheWriteTokens: 0, reasoningTokens: 10, cost: 0, costCurrency: "USD" };
    append("turn/start", { turnId: "t" }); append("step/start", { turnId: "t", stepId: "s" });
    append("request/header", { requestId: "r", turnId: "t", stepId: "s" });
    append("request/context", { requestId: "r", turnId: "t", stepId: "s", messages: [] });
    append("assistant/message", { messageId: "a", requestId: "r", content: "done", usage });
    append("step/end", { turnId: "t", stepId: "s", status: "completed", usage });
    const snapshot = () => projectSessionSnapshot({ header, events: journal.events, registry });
    expect(snapshot().usage).toMatchObject({ inputTokens: 100, outputTokens: 20, totalTokens: 170, costUsd: null });
    append("step/start", { turnId: "t", stepId: "s2" });
    append("request/header", { requestId: "r2", turnId: "t", stepId: "s2" });
    append("request/context", { requestId: "r2", turnId: "t", stepId: "s2", messages: [] });
    append("assistant/message", { messageId: "a2", requestId: "r2", content: "free", usage: { ...usage, costProvenance: { version: 1, basis: "estimated", reason: null, pricingSnapshot: null } } });
    expect(snapshot().usage).toMatchObject({ totalTokens: 340, costUsd: 0 });
  });
});

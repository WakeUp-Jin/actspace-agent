import { describe, it, expect, vi } from "vitest";
import { MockLLMService, mockText, mockToolCall } from "../../llm/services/mock";
import { createEmptyUsage } from "../../messages";
import type { AssistantMessage } from "../../messages";
import type { LlmUsagePayload } from "@actspace/shared";
import { ToolManager, type KairosGuardContext } from "../../tools/manager";
import { KairosRunner } from "../runner";
import {
  DEFAULT_BLOCKLIST,
  DEFAULT_PATHS_CONFIG,
  DEFAULT_PREFERENCES,
} from "../config/schema";
import { registerKairosTools } from "../tools";
import type { KairosConfig } from "../config/loader";
import type { SessionEvent } from "@actspace/shared";
import type { KairosShortTermMemoryContext, KairosShortTermLoadResult } from "../context/short-term";
import type { WatchDiffEntry } from "../context/watch-diff";
import type { SessionsDigestResult } from "../context/sessions-digest";
import type { TickPayload } from "../briefs/dispatcher";
import type { BriefsIndexManager } from "../briefs/index-manager";
import type { KairosInboxSummary } from "../inbox";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";

async function makeTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "kairos-runner-test-"));
}

function baseConfig(): KairosConfig {
  return {
    preferences: { ...DEFAULT_PREFERENCES, enabled: true },
    paths: { ...DEFAULT_PATHS_CONFIG, paths: [] },
    blocklist: { ...DEFAULT_BLOCKLIST, toolsDenied: [] },
    ruleMd: "be concise",
    warnings: [],
  };
}

function fakeShortTerm(): KairosShortTermMemoryContext {
  const result: KairosShortTermLoadResult = {
    messages: [],
    summarySegments: [],
    loadedTokenEstimate: 0,
  };
  return {
    load: async () => result,
    estimateTokens: async () => 0,
  } as unknown as KairosShortTermMemoryContext;
}

const emptyDigest: SessionsDigestResult = { workspaces: [], generatedAt: new Date().toISOString() };

const baseGuard: KairosGuardContext = {
  allowedRoots: ["/tmp/work"],
  blocklistPaths: [],
  toolsDenied: [],
};

function tickPayload(): TickPayload {
  return { trigger: "auto", content: "<tick test/>" };
}

function sampleInboxSummary(): KairosInboxSummary {
  return {
    text: "## Agent 收件箱（Main/Lab -> Kairos）\n\n### Main Agent (main-agent.md)\n请观察重复失败。",
    files: [
      {
        source: "main-agent",
        path: "/tmp/kairos/inbox/main-agent.md",
        content: "请观察重复失败。",
        totalMessageCount: 1,
        includedMessageCount: 1,
        truncated: false,
        missing: false,
      },
    ],
    truncated: false,
    warnings: [],
  } as KairosInboxSummary;
}

describe("KairosRunner.processTick", () => {
  it("emits kairos_tick_injected first, runs LLM turn, extracts last sleep seconds", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "mock-model" });
    llm.setResponses([
      mockToolCall("sleep", { seconds: 90, reason: "cool" }, { id: "tc_sleep_1" }),
      mockText("done"),
    ]);

    const toolManager = new ToolManager({ workspaceRoot: "/tmp/work" });
    registerKairosTools(toolManager);

    const events: SessionEvent[] = [];
    const runner = new KairosRunner({
      config: baseConfig(),
      shortTerm: fakeShortTerm(),
      observeRefresh: async () => ({ watchDiffs: [] as WatchDiffEntry[], sessionsDigest: emptyDigest }),
      activeBriefsCount: async () => 0,
      eventSink: async (e) => {
        events.push(e);
      },
      llm,
      toolManager,
      kairosGuard: baseGuard,
    });

    const result = await runner.processTick({ type: "tick", payload: tickPayload() });

    expect(events[0].type).toBe("kairos_tick_injected");
    expect(events.some((e) => e.type === "tool_call")).toBe(true);
    expect(events.some((e) => e.type === "tool_result")).toBe(true);
    expect(events.some((e) => e.type === "assistant_message")).toBe(true);
    expect(result.sleepSecondsRequested).toBe(90);
    expect(result.toolCallCount).toBe(1);
  });

  it("takes the LAST sleep arg when LLM calls sleep multiple times", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "mock-model" });
    llm.setResponses([
      mockToolCall("sleep", { seconds: 30 }, { id: "tc_sleep_a" }),
      mockToolCall("sleep", { seconds: 180 }, { id: "tc_sleep_b" }),
      mockText("zz"),
    ]);

    const toolManager = new ToolManager({ workspaceRoot: "/tmp/work" });
    registerKairosTools(toolManager);

    const runner = new KairosRunner({
      config: baseConfig(),
      shortTerm: fakeShortTerm(),
      observeRefresh: async () => ({ watchDiffs: [], sessionsDigest: emptyDigest }),
      activeBriefsCount: async () => 0,
      eventSink: async () => {},
      llm,
      toolManager,
      kairosGuard: baseGuard,
    });
    const r = await runner.processTick({ type: "tick", payload: tickPayload() });
    expect(r.sleepSecondsRequested).toBe(180);
  });

  it("forwards thinkingEnabled into AgentLoopConfig when set", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "mock-model" });
    const streamSpy = vi.spyOn(llm, "stream");
    llm.setResponses([mockText("hi")]);

    const toolManager = new ToolManager({ workspaceRoot: "/tmp/work" });
    registerKairosTools(toolManager);

    const runner = new KairosRunner({
      config: baseConfig(),
      shortTerm: fakeShortTerm(),
      observeRefresh: async () => ({ watchDiffs: [], sessionsDigest: emptyDigest }),
      activeBriefsCount: async () => 0,
      eventSink: async () => {},
      llm,
      toolManager,
      kairosGuard: baseGuard,
      thinkingEnabled: false,
    });
    await runner.processTick({ type: "tick", payload: tickPayload() });

    expect(streamSpy).toHaveBeenCalled();
    // llm.stream(context, opts) → opts.thinkingEnabled === false
    const opts = streamSpy.mock.calls.at(-1)?.[1] as { thinkingEnabled?: boolean } | undefined;
    expect(opts?.thinkingEnabled).toBe(false);
  });

  it("injects Agent inbox summary into the tick user message, keeping system prompt static", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "mock-model" });
    llm.setResponses([
      (context) => {
        // 缓存约束：每 tick 必变内容禁止进入 system prompt
        expect(context.systemPrompt).not.toContain("Agent 收件箱");
        expect(context.systemPrompt).not.toContain("[当前时间]");
        const last = context.messages.at(-1);
        const content = typeof last?.content === "string" ? last.content : "";
        expect(content).toContain("Agent 收件箱");
        expect(content).toContain("请观察重复失败");
        expect(content).toContain("[当前时间]");
        return mockText("seen");
      },
    ]);

    const toolManager = new ToolManager({ workspaceRoot: "/tmp/work" });
    registerKairosTools(toolManager);

    const runner = new KairosRunner({
      config: baseConfig(),
      shortTerm: fakeShortTerm(),
      observeRefresh: async () => ({ watchDiffs: [], sessionsDigest: emptyDigest }),
      activeBriefsCount: async () => 0,
      loadInboxSummary: async () => sampleInboxSummary(),
      eventSink: async () => {},
      llm,
      toolManager,
      kairosGuard: baseGuard,
    });

    await runner.processTick({ type: "tick", payload: tickPayload() });
  });

  it("commits observation cursors only after a successful tick", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "mock-model" });
    llm.setResponses([mockText("ok")]);

    const toolManager = new ToolManager({ workspaceRoot: "/tmp/work" });
    registerKairosTools(toolManager);

    let observeCommits = 0;
    let inboxCommits = 0;
    const runner = new KairosRunner({
      config: baseConfig(),
      shortTerm: fakeShortTerm(),
      observeRefresh: async () => ({
        watchDiffs: [],
        sessionsDigest: emptyDigest,
        commit: async () => {
          observeCommits += 1;
        },
      }),
      activeBriefsCount: async () => 0,
      loadInboxSummary: async () => sampleInboxSummary(),
      commitInboxCursor: async () => {
        inboxCommits += 1;
      },
      eventSink: async () => {},
      llm,
      toolManager,
      kairosGuard: baseGuard,
    });

    await runner.processTick({ type: "tick", payload: tickPayload() });
    expect(observeCommits).toBe(1);
    expect(inboxCommits).toBe(1);
  });

  it("does NOT commit observation cursors when the tick fails (增量不丢)", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "mock-model" });
    llm.setResponses([
      () => {
        throw new Error("llm exploded");
      },
    ]);

    const toolManager = new ToolManager({ workspaceRoot: "/tmp/work" });
    registerKairosTools(toolManager);

    let observeCommits = 0;
    let inboxCommits = 0;
    const runner = new KairosRunner({
      config: baseConfig(),
      shortTerm: fakeShortTerm(),
      observeRefresh: async () => ({
        watchDiffs: [],
        sessionsDigest: emptyDigest,
        commit: async () => {
          observeCommits += 1;
        },
      }),
      activeBriefsCount: async () => 0,
      loadInboxSummary: async () => sampleInboxSummary(),
      commitInboxCursor: async () => {
        inboxCommits += 1;
      },
      eventSink: async () => {},
      llm,
      toolManager,
      kairosGuard: baseGuard,
    });

    await expect(
      runner.processTick({ type: "tick", payload: tickPayload() }),
    ).rejects.toThrow();
    expect(observeCommits).toBe(0);
    expect(inboxCommits).toBe(0);
  });

  it("persists exactly the same tick content as sent to the LLM (发送 = 落盘 = 重放)", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "mock-model" });
    let sentContent = "";
    llm.setResponses([
      (context) => {
        const last = context.messages.at(-1);
        sentContent = typeof last?.content === "string" ? last.content : "";
        return mockText("ok");
      },
    ]);

    const toolManager = new ToolManager({ workspaceRoot: "/tmp/work" });
    registerKairosTools(toolManager);

    const events: SessionEvent[] = [];
    const runner = new KairosRunner({
      config: baseConfig(),
      shortTerm: fakeShortTerm(),
      observeRefresh: async () => ({ watchDiffs: [], sessionsDigest: emptyDigest }),
      activeBriefsCount: async () => 0,
      loadInboxSummary: async () => sampleInboxSummary(),
      eventSink: async (e) => {
        events.push(e);
      },
      llm,
      toolManager,
      kairosGuard: baseGuard,
    });

    await runner.processTick({ type: "tick", payload: tickPayload() });

    const injected = events.find((e) => e.type === "kairos_tick_injected");
    expect(injected).toBeDefined();
    const persisted = (injected?.payload as { content?: string }).content ?? "";
    expect(persisted.length).toBeGreaterThan(0);
    expect(persisted).toBe(sentContent);
  });

  it("does not pass thinkingEnabled when option is omitted (LLM uses ModelSpec default)", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "mock-model" });
    const streamSpy = vi.spyOn(llm, "stream");
    llm.setResponses([mockText("hi")]);

    const toolManager = new ToolManager({ workspaceRoot: "/tmp/work" });
    registerKairosTools(toolManager);

    const runner = new KairosRunner({
      config: baseConfig(),
      shortTerm: fakeShortTerm(),
      observeRefresh: async () => ({ watchDiffs: [], sessionsDigest: emptyDigest }),
      activeBriefsCount: async () => 0,
      eventSink: async () => {},
      llm,
      toolManager,
      kairosGuard: baseGuard,
    });
    await runner.processTick({ type: "tick", payload: tickPayload() });

    const opts = streamSpy.mock.calls.at(-1)?.[1] as { thinkingEnabled?: boolean } | undefined;
    expect(opts?.thinkingEnabled).toBeUndefined();
  });

  it("returns null sleep when LLM never calls sleep", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "mock-model" });
    llm.setResponses([mockText("nothing to do")]);

    const toolManager = new ToolManager({ workspaceRoot: "/tmp/work" });
    registerKairosTools(toolManager);

    const runner = new KairosRunner({
      config: baseConfig(),
      shortTerm: fakeShortTerm(),
      observeRefresh: async () => ({ watchDiffs: [], sessionsDigest: emptyDigest }),
      activeBriefsCount: async () => 0,
      eventSink: async () => {},
      llm,
      toolManager,
      kairosGuard: baseGuard,
    });
    const r = await runner.processTick({ type: "tick", payload: tickPayload() });
    expect(r.sleepSecondsRequested).toBeNull();
  });

  it("emits a persisted llm_usage SessionEvent per assistant message_end with non-zero usage", async () => {
    // 用一条手写带 usage 的 AssistantMessage（mockText 默认 usage 为 0，不会产 llm_usage）。
    const replyWithUsage: AssistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: "done" }],
      model: "deepseek-v4-flash",
      provider: "deepseek",
      usage: {
        ...createEmptyUsage(),
        input: 3_200,
        output: 800,
        totalTokens: 4_000,
        cacheHit: 1_200,
        cacheMiss: 2_000,
        serverToolUse: { webSearchRequests: 2, webFetchRequests: 1 },
      },
      stopReason: "stop",
      timestamp: Date.now(),
      source: "llm",
    };

    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "deepseek-v4-flash" });
    llm.setResponses([replyWithUsage]);

    const toolManager = new ToolManager({ workspaceRoot: "/tmp/work" });
    registerKairosTools(toolManager);

    const events: SessionEvent[] = [];
    const runner = new KairosRunner({
      config: baseConfig(),
      shortTerm: fakeShortTerm(),
      observeRefresh: async () => ({ watchDiffs: [] as WatchDiffEntry[], sessionsDigest: emptyDigest }),
      activeBriefsCount: async () => 0,
      eventSink: async (e) => {
        events.push(e);
      },
      llm,
      toolManager,
      kairosGuard: baseGuard,
    });

    await runner.processTick({ type: "tick", payload: tickPayload() });

    const usageEvents = events.filter((e) => e.type === "llm_usage");
    expect(usageEvents).toHaveLength(1);
    const payload = usageEvents[0].payload as LlmUsagePayload;
    expect(payload.promptTokens).toBe(3_200);
    expect(payload.completionTokens).toBe(800);
    expect(payload.totalTokens).toBe(4_000);
    expect(payload.cacheHitTokens).toBe(1_200);
    expect(payload.cacheMissTokens).toBe(2_000);
    expect(payload.serverToolUse).toEqual({ webSearchRequests: 2, webFetchRequests: 1 });
    expect(payload.modelId).toBe("deepseek-v4-flash");
    expect(payload.cost.total).toBeGreaterThan(0);
    // cost.currency 由 model-config pricing 决定；当前 DeepSeek pricing 写的是 CNY（国产模型按人民币计费）。
    expect(["USD", "CNY"]).toContain(payload.cost.currency);
  });

  it("does not emit llm_usage when AssistantMessage carries zero usage (mock default)", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "mock-model" });
    llm.setResponses([mockText("hi")]);

    const toolManager = new ToolManager({ workspaceRoot: "/tmp/work" });
    registerKairosTools(toolManager);

    const events: SessionEvent[] = [];
    const runner = new KairosRunner({
      config: baseConfig(),
      shortTerm: fakeShortTerm(),
      observeRefresh: async () => ({ watchDiffs: [], sessionsDigest: emptyDigest }),
      activeBriefsCount: async () => 0,
      eventSink: async (e) => {
        events.push(e);
      },
      llm,
      toolManager,
      kairosGuard: baseGuard,
    });

    await runner.processTick({ type: "tick", payload: tickPayload() });
    expect(events.some((e) => e.type === "llm_usage")).toBe(false);
  });

  it("calls briefsIndex.markRun for brief-triggered ticks", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "mock-model" });
    llm.setResponses([mockText("done")]);

    const toolManager = new ToolManager({ workspaceRoot: "/tmp/work" });
    registerKairosTools(toolManager);

    const markRun = vi.fn(async (_id: string, _res: "ok" | "failed") => {});
    const briefsIndex = { markRun } as unknown as BriefsIndexManager;

    const runner = new KairosRunner({
      config: baseConfig(),
      shortTerm: fakeShortTerm(),
      observeRefresh: async () => ({ watchDiffs: [], sessionsDigest: emptyDigest }),
      activeBriefsCount: async () => 0,
      eventSink: async () => {},
      llm,
      toolManager,
      kairosGuard: baseGuard,
      briefsIndex,
    });
    await runner.processTick({
      type: "tick",
      payload: { trigger: "brief", briefId: "morning-recap", content: "复盘昨日" },
    });
    expect(markRun).toHaveBeenCalledWith("morning-recap", "ok", expect.any(Date));
  });

  it("把 getAbortSignal() 透传进 agent loop（llm.stream 收到同一 signal）", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "mock-model" });
    const streamSpy = vi.spyOn(llm, "stream");
    llm.setResponses([mockText("hi")]);

    const controller = new AbortController();
    const toolManager = new ToolManager({ workspaceRoot: "/tmp/work" });
    registerKairosTools(toolManager);

    const runner = new KairosRunner({
      config: baseConfig(),
      shortTerm: fakeShortTerm(),
      observeRefresh: async () => ({ watchDiffs: [], sessionsDigest: emptyDigest }),
      activeBriefsCount: async () => 0,
      eventSink: async () => {},
      llm,
      toolManager,
      kairosGuard: baseGuard,
      getAbortSignal: () => controller.signal,
    });
    await runner.processTick({ type: "tick", payload: tickPayload() });

    const opts = streamSpy.mock.calls.at(-1)?.[1] as { signal?: AbortSignal } | undefined;
    expect(opts?.signal).toBe(controller.signal);
  });

  it("已 abort 的 signal 直接短路：不调 llm.stream、无 assistant_message", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "mock-model" });
    const streamSpy = vi.spyOn(llm, "stream");
    llm.setResponses([mockText("hi")]);

    const controller = new AbortController();
    controller.abort();
    const toolManager = new ToolManager({ workspaceRoot: "/tmp/work" });
    registerKairosTools(toolManager);

    const events: SessionEvent[] = [];
    const runner = new KairosRunner({
      config: baseConfig(),
      shortTerm: fakeShortTerm(),
      observeRefresh: async () => ({ watchDiffs: [], sessionsDigest: emptyDigest }),
      activeBriefsCount: async () => 0,
      eventSink: async (e) => {
        events.push(e);
      },
      llm,
      toolManager,
      kairosGuard: baseGuard,
      getAbortSignal: () => controller.signal,
    });

    // loop 在第一步就因 aborted 退出、没产出 assistant message → runAgentLoop 抛错。
    // 关键断言：完全没有真正发起 LLM 请求（shutdown 时正在飞的请求要能立刻被掐断）。
    await expect(runner.processTick({ type: "tick", payload: tickPayload() })).rejects.toThrow(
      /without producing an assistant/,
    );
    expect(streamSpy).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === "assistant_message")).toBe(false);
  });
});

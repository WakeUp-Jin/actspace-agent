import { describe, it, expect, vi } from "vitest";
import { MockLLMService, mockText, mockToolCall } from "../../llm/services/mock";
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
});

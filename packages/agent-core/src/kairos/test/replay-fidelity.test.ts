/**
 * 重放保真回归（docs/design-docs/kairos/agent-kairos-prompt-cache-optimization.md §5.2）：
 *
 * 用同一个 tick 的事件流双向验证——现场发送给 LLM 的请求消息（含 thinking/
 * text/toolCall 块结构）与「落盘事件 → toLlmMessages 重放」的消息，经
 * Anthropic 序列化后必须逐字节一致。不一致 = 下个 tick 前缀缓存在分歧处断裂。
 */
import { describe, it, expect } from "vitest";
import { MockLLMService } from "../../llm/services/mock";
import { convertMessagesToAnthropic } from "../../llm/anthropic-convert";
import { createEmptyUsage, type AssistantMessage, type Message } from "../../messages";
import { ToolManager, type KairosGuardContext } from "../../tools/manager";
import { registerKairosTools } from "../tools";
import { KairosRunner } from "../runner";
import {
  DEFAULT_BLOCKLIST,
  DEFAULT_PATHS_CONFIG,
  DEFAULT_PREFERENCES,
} from "../config/schema";
import type { KairosConfig } from "../config/loader";
import type { SessionEvent } from "@actspace/shared";
import type { KairosShortTermMemoryContext, KairosShortTermLoadResult } from "../context/short-term";
import { sanitizeOrphanToolPairs, toLlmMessages } from "../context/short-term";
import type { SessionsDigestResult } from "../context/sessions-digest";

function baseConfig(): KairosConfig {
  return {
    preferences: { ...DEFAULT_PREFERENCES, enabled: true },
    paths: { ...DEFAULT_PATHS_CONFIG, paths: [] },
    blocklist: { ...DEFAULT_BLOCKLIST, toolsDenied: [] },
    ruleMd: "be concise",
    soulMd: "",
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

const emptyDigest: SessionsDigestResult = {
  workspaces: [],
  generatedAt: new Date().toISOString(),
  cursor: {},
};

const baseGuard: KairosGuardContext = {
  allowedRoots: ["/tmp/work"],
  blocklistPaths: [],
  toolsDenied: [],
};

function assistantReply(content: AssistantMessage["content"], stopReason: AssistantMessage["stopReason"]): AssistantMessage {
  return {
    role: "assistant",
    content,
    model: "mock-model",
    provider: "mock",
    usage: createEmptyUsage(),
    stopReason,
    timestamp: Date.now(),
  };
}

describe("Kairos replay fidelity (现场 === 重放)", () => {
  it("replayed messages serialize identically to the live request prefix, including thinking", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "mock-model" });

    // 第一回复：thinking(带 signature) + text + toolCall —— 现场块顺序
    const reply1 = assistantReply(
      [
        { type: "thinking", thinking: "需要先 sleep 一下。", signature: "sig_abc123" },
        { type: "text", text: "好的，我休息 60 秒。" },
        { type: "toolCall", id: "tc_sleep_1", name: "sleep", arguments: { seconds: 60 } },
      ],
      "toolUse",
    );

    // 第二回复前捕获现场请求消息（= 上个回复 + toolResult 之后的完整 prefix）
    let liveRequestMessages: Message[] = [];
    llm.setResponses([
      reply1,
      (context) => {
        liveRequestMessages = context.messages.map((m) => ({ ...m }));
        return assistantReply(
          [
            { type: "thinking", thinking: "搞定了。", signature: "sig_def456" },
            { type: "text", text: "已安排休息。" },
          ],
          "stop",
        );
      },
    ]);

    const toolManager = new ToolManager({ workspaceRoot: "/tmp/work" });
    registerKairosTools(toolManager);

    const events: SessionEvent[] = [];
    const runner = new KairosRunner({
      config: baseConfig(),
      shortTerm: fakeShortTerm(),
      observeRefresh: async () => ({ sessionsDigest: emptyDigest }),
      activeBriefs: async () => [],
      eventSink: async (e) => {
        events.push(e);
      },
      llm,
      toolManager,
      kairosGuard: baseGuard,
      thinkingEnabled: true,
    });

    await runner.processTick({ type: "tick", payload: { trigger: "auto", content: "" } });

    // 重放：落盘事件 → toLlmMessages → sanitize（正常流不应触发任何丢弃）
    const replayed = sanitizeOrphanToolPairs(toLlmMessages(events));

    // 现场请求 prefix = [tick user, assistant(thinking,text,toolCall), toolResult]
    expect(liveRequestMessages.length).toBe(3);
    const replayedPrefix = replayed.slice(0, liveRequestMessages.length);

    const liveSerialized = convertMessagesToAnthropic(liveRequestMessages);
    const replaySerialized = convertMessagesToAnthropic(replayedPrefix);
    expect(replaySerialized).toEqual(liveSerialized);

    // thinking signature 必须存活（anthropic-convert 只回发带 signature 的 thinking 块）
    const json = JSON.stringify(replaySerialized);
    expect(json).toContain("sig_abc123");
    expect(json).toContain("需要先 sleep 一下。");

    // 重放尾部：最终回复也折叠成一条 assistant 消息，块顺序 [thinking, text]
    const last = replayed.at(-1);
    expect(last?.role).toBe("assistant");
    if (last?.role === "assistant") {
      expect(last.content.map((c) => c.type)).toEqual(["thinking", "text"]);
    }
  });

  it("merges consecutive thinking/text/toolCall events of one reply into a single assistant message", () => {
    const mk = (type: SessionEvent["type"], payload: unknown): SessionEvent => ({
      id: `evt_${Math.random().toString(36).slice(2, 8)}`,
      sessionId: "kairos-test",
      turnId: "turn_1",
      type,
      timestamp: "2026-06-10T01:00:00.000Z",
      schemaVersion: 1,
      payload,
    });

    const events: SessionEvent[] = [
      mk("kairos_tick_injected", { trigger: "auto", content: "<tick>...</tick>" }),
      // 第一次 LLM 回复
      mk("thinking", { content: "想一想", signature: "sig_1" }),
      mk("assistant_message", { content: "我来读文件", model: "m", provider: "p" }),
      mk("tool_call", { id: "tc_a", name: "read_file", arguments: { path: "a.md" } }),
      mk("tool_call", { id: "tc_b", name: "read_file", arguments: { path: "b.md" } }),
      mk("llm_usage", { callId: "c1", provider: "p", model: "m", promptTokens: 1, completionTokens: 1, totalTokens: 2 }),
      mk("tool_result", { toolCallId: "tc_a", toolName: "read_file", ok: true, summary: "A", modelOutput: "A" }),
      mk("tool_result", { toolCallId: "tc_b", toolName: "read_file", ok: true, summary: "B", modelOutput: "B" }),
      // 第二次 LLM 回复（纯文本）
      mk("thinking", { content: "总结一下" }),
      mk("assistant_message", { content: "都读完了", model: "m", provider: "p" }),
    ];

    const messages = toLlmMessages(events);
    expect(messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "toolResult",
      "toolResult",
      "assistant",
    ]);

    const first = messages[1];
    if (first.role === "assistant") {
      // 一条消息内块顺序 [thinking, text, toolCall, toolCall]；tool_use 永远在末尾
      expect(first.content.map((c) => c.type)).toEqual(["thinking", "text", "toolCall", "toolCall"]);
    }
    const second = messages[4];
    if (second.role === "assistant") {
      expect(second.content.map((c) => c.type)).toEqual(["thinking", "text"]);
    }
  });
});

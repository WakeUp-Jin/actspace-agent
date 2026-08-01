import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SessionEvent } from "@actspace/shared";
import { ContextManager } from "../manager";
import { SystemPromptContext } from "../modules/system-prompt";
import { CACHE_STABILITY, SystemPart, type ContextModule } from "../types";
import { appendEvents } from "../../persistence/jsonl";
import type { UserMessage, AssistantMessage } from "../../messages";
import { createEmptyUsage } from "../../messages";

function createTestContextManager() {
  const systemPrompt = new SystemPromptContext("You are actspace, a helpful AI assistant.");
  return new ContextManager({ systemPromptModule: systemPrompt });
}

describe("ContextManager", () => {
  it("should build context with system prompt", () => {
    const cm = createTestContextManager();
    const ctx = cm.getContext();

    expect(ctx.systemPrompt).toBeDefined();
    expect(ctx.systemPrompt).toContain("actspace");
  });

  it("should track messages via appendMessage", () => {
    const cm = createTestContextManager();

    const userMsg: UserMessage = { role: "user", content: "hello", timestamp: Date.now() };
    cm.appendMessage(userMsg);

    const ctx = cm.getContext();
    expect(ctx.messages.length).toBe(1);
    expect(ctx.messages[0].role).toBe("user");
    expect(cm.getMessageCount()).toBe(1);
  });

  it("should accumulate multiple messages", () => {
    const cm = createTestContextManager();

    cm.appendMessage({ role: "user", content: "q1", timestamp: Date.now() });
    cm.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "a1" }],
      model: "test", provider: "test",
      usage: createEmptyUsage(), stopReason: "stop", timestamp: Date.now(),
    } as AssistantMessage);
    cm.appendMessage({ role: "user", content: "q2", timestamp: Date.now() });

    expect(cm.getMessageCount()).toBe(3);
    const ctx = cm.getContext();
    expect(ctx.messages[0].role).toBe("user");
    expect(ctx.messages[1].role).toBe("assistant");
    expect(ctx.messages[2].role).toBe("user");
  });

  it("should attach tools to context", () => {
    const cm = createTestContextManager();
    cm.setTools([
      { name: "read_file", description: "Read file", parameters: { type: "object" } },
    ]);

    const ctx = cm.getContext();
    expect(ctx.tools).toBeDefined();
    expect(ctx.tools!.length).toBe(1);
    expect(ctx.tools![0].name).toBe("read_file");
  });

  it("should not include tools when none set", () => {
    const cm = createTestContextManager();
    const ctx = cm.getContext();

    expect(ctx.tools).toBeUndefined();
  });

  it("returns tools in deterministic order across getContext calls", () => {
    const cm = createTestContextManager();
    cm.setTools([
      { name: "read_file", description: "Read file", parameters: { type: "object" } },
      { name: "bash", description: "Run bash", parameters: { type: "object" } },
    ]);

    // 守护：工具序列化在多次组装间字节级一致，避免破坏 DeepSeek prefix-cache。
    expect(JSON.stringify(cm.getContext().tools)).toBe(JSON.stringify(cm.getContext().tools));
  });

  it("orders higher-stability system parts before lower-stability ones", () => {
    const longTerm: ContextModule = {
      format: () => ({
        systemParts: [
          new SystemPart("memory", "long term", "LONG_TERM_MARKER", CACHE_STABILITY.SEMI),
        ],
        messages: [],
      }),
    };
    const cm = new ContextManager({
      systemPromptModule: new SystemPromptContext("CORE_MARKER"),
      longTermModule: longTerm,
    });

    const systemPrompt = cm.getContext().systemPrompt ?? "";
    // 系统提示词整体为 IMMUTABLE，应排在 SEMI 的长期记忆之前（构成稳定前缀）。
    expect(systemPrompt.indexOf("CORE_MARKER")).toBeLessThan(systemPrompt.indexOf("LONG_TERM_MARKER"));
  });

  it("needsCompression should be false with small context", () => {
    const cm = createTestContextManager();
    cm.appendMessage({ role: "user", content: "short message", timestamp: Date.now() });

    expect(cm.needsCompression()).toBe(false);
  });

  it("should return valid usage snapshot", () => {
    const cm = createTestContextManager();
    cm.appendMessage({ role: "user", content: "hello", timestamp: Date.now() });

    const snapshot = cm.getUsageSnapshot();
    expect(snapshot).toBeDefined();
    expect(snapshot.totalTokens).toBeGreaterThan(0);
    expect(snapshot.maxTokens).toBeGreaterThan(0);
    expect(snapshot.percentUsed).toBeGreaterThanOrEqual(0);
  });

  it("accounts the compaction summary under the summarizedConversation bucket", () => {
    const cm = createTestContextManager();
    cm.appendMessage({ role: "user", content: "latest user input", timestamp: Date.now() });
    cm.appendMessage({
      role: "user",
      content: "[摘要] older turns condensed here",
      timestamp: Date.now(),
      source: "compaction",
    });

    const snapshot = cm.getUsageSnapshot();
    const summarized = snapshot.buckets.find((b) => b.key === "summarizedConversation");
    const conversation = snapshot.buckets.find((b) => b.key === "conversation");

    // 压缩摘要进 summarizedConversation 桶，普通消息进 conversation 桶，两者都应有 token。
    expect(summarized?.tokens ?? 0).toBeGreaterThan(0);
    expect(conversation?.tokens ?? 0).toBeGreaterThan(0);
    // 不再有 mcp / subagents 桶。
    expect(snapshot.buckets.some((b) => b.key === "mcp")).toBe(false);
    expect(snapshot.buckets.some((b) => b.key === "subagents")).toBe(false);
  });

  it("should return compression config", () => {
    const cm = createTestContextManager();
    const config = cm.getConfig();

    expect(config.contextWindow).toBe(200_000);
    expect(config.compressionThreshold).toBe(0.85);
    expect(config.compressKeepRatio).toBe(0.3);
  });

  it("should accept custom compression config", () => {
    const systemPrompt = new SystemPromptContext("Test");
    const cm = new ContextManager({
      systemPromptModule: systemPrompt,
      config: { contextWindow: 50_000, compressionThreshold: 0.7 },
    });

    const config = cm.getConfig();
    expect(config.contextWindow).toBe(50_000);
    expect(config.compressionThreshold).toBe(0.7);
  });
});

describe("ContextManager.createForSession", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `actspace-test-manager-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  function createEvent(type: string, payload: unknown, idx: number): SessionEvent {
    return {
      id: `evt_${idx}`,
      sessionId: "test-session",
      agentRunId: "turn-1",
      type: type as SessionEvent["type"],
      timestamp: new Date().toISOString(),
      schemaVersion: 2,
      payload,
    };
  }

  it("constructs an empty conversation when sessionPath is omitted", async () => {
    const cm = await ContextManager.createForSession({
      systemPromptModule: new SystemPromptContext("test"),
    });
    expect(cm.getMessageCount()).toBe(0);
    expect(cm.getContext().messages.length).toBe(0);
  });

  it("constructs an empty conversation when session.jsonl does not exist", async () => {
    const missingPath = join(testDir, "no-such-session.jsonl");
    const cm = await ContextManager.createForSession({
      systemPromptModule: new SystemPromptContext("test"),
      sessionPath: missingPath,
    });
    expect(cm.getMessageCount()).toBe(0);
  });

  it("preloads conversation history from session.jsonl", async () => {
    const sessionPath = join(testDir, "session.jsonl");
    const events: SessionEvent[] = [
      createEvent("user_message", { content: "hello" }, 1),
      createEvent(
        "assistant_message",
        {
          content: "hi back",
          stopReason: "stop",
          model: "test",
          provider: "test",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        },
        2,
      ),
    ];
    await appendEvents(sessionPath, events);

    const cm = await ContextManager.createForSession({
      systemPromptModule: new SystemPromptContext("test"),
      sessionPath,
    });

    const ctx = cm.getContext();
    expect(ctx.messages.length).toBe(2);
    expect(ctx.messages[0].role).toBe("user");
    expect(ctx.messages[1].role).toBe("assistant");
  });

  it("appendMessage after createForSession yields history + new message", async () => {
    const sessionPath = join(testDir, "session.jsonl");
    await appendEvents(sessionPath, [
      createEvent("user_message", { content: "first" }, 1),
      createEvent(
        "assistant_message",
        {
          content: "ack",
          stopReason: "stop",
          model: "test",
          provider: "test",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        },
        2,
      ),
    ]);

    const cm = await ContextManager.createForSession({
      systemPromptModule: new SystemPromptContext("test"),
      sessionPath,
    });

    cm.appendMessage({ role: "user", content: "second", timestamp: Date.now() });

    const messages = cm.getContext().messages;
    expect(messages.length).toBe(3);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
    expect(messages[2].role).toBe("user");
  });
});

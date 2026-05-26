/**
 * Session history replay — 端到端测试
 *
 * 验证 ConversationContext 在构造阶段一次性从 session.jsonl 恢复历史的能力：
 * 1. 第一轮 turn 写盘后，第二轮用同一 sessionPath 构造的 ContextManager
 *    在调用 LLM 时已经看见上一轮的 user/assistant 消息。
 * 2. session.jsonl 不存在时（全新 session 首轮），不抛错，LLM 只看到本轮 user。
 *
 * 通过 MockLLMService 的 ResponseFactory 捕获 LLM 实际看到的 messages。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContextManager } from "../../context/manager";
import { SystemPromptContext } from "../../context/modules/system-prompt";
import type { Context, Message } from "../../messages";
import { MockLLMService, mockText } from "../../llm/services/mock";
import { ToolManager } from "../../tools/manager";
import { runTurnWithAgent } from "../bridge";
import { writeSessionResult } from "../../persistence/session-store";
import { createSessionStorePaths } from "../../persistence/session-store";

let testDir: string;

beforeEach(async () => {
  testDir = join(
    tmpdir(),
    `actspace-test-history-replay-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

function snapshotMessages(context: Context): Message[] {
  return context.messages.map((m) => ({ ...m }) as Message);
}

function createDepsForSession(contextManager: ContextManager) {
  const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "mock-model" });
  const toolManager = new ToolManager({ workspaceRoot: testDir });
  return { llm, toolManager, contextManager };
}

describe("session history replay end-to-end", () => {
  it("first turn sees only current user message; second turn sees prior history + new user", async () => {
    const sessionDir = join(testDir, "session-replay-1");
    await mkdir(sessionDir, { recursive: true });
    const sessionPaths = createSessionStorePaths(sessionDir);
    const sessionId = "session-replay-1";

    // ─── 第一轮 ───
    const firstTurnSeenMessages: Message[][] = [];
    const cmFirst = await ContextManager.createForSession({
      systemPromptModule: new SystemPromptContext("You are a test assistant."),
      sessionPath: sessionPaths.sessionPath,
    });
    expect(cmFirst.getMessageCount()).toBe(0);

    const depsFirst = createDepsForSession(cmFirst);
    depsFirst.llm.setResponses([
      (context) => {
        firstTurnSeenMessages.push(snapshotMessages(context));
        return mockText("First reply.");
      },
    ]);

    const firstResult = await runTurnWithAgent(
      {
        sessionId,
        turnId: "turn-1",
        userInput: "Hello, who are you?",
      },
      depsFirst,
    );
    await writeSessionResult(sessionPaths, firstResult);

    expect(firstTurnSeenMessages.length).toBe(1);
    expect(firstTurnSeenMessages[0].length).toBe(1);
    expect(firstTurnSeenMessages[0][0].role).toBe("user");

    // ─── 第二轮 ───
    const secondTurnSeenMessages: Message[][] = [];
    const cmSecond = await ContextManager.createForSession({
      systemPromptModule: new SystemPromptContext("You are a test assistant."),
      sessionPath: sessionPaths.sessionPath,
    });
    expect(cmSecond.getMessageCount()).toBe(2); // user + assistant from turn 1

    const depsSecond = createDepsForSession(cmSecond);
    depsSecond.llm.setResponses([
      (context) => {
        secondTurnSeenMessages.push(snapshotMessages(context));
        return mockText("Second reply.");
      },
    ]);

    const secondResult = await runTurnWithAgent(
      {
        sessionId,
        turnId: "turn-2",
        userInput: "Are you still there?",
      },
      depsSecond,
    );
    await writeSessionResult(sessionPaths, secondResult);

    expect(secondTurnSeenMessages.length).toBe(1);
    const seen = secondTurnSeenMessages[0];
    // turn 1 user + turn 1 assistant + turn 2 user
    expect(seen.length).toBe(3);
    expect(seen[0].role).toBe("user");
    expect(seen[1].role).toBe("assistant");
    expect(seen[2].role).toBe("user");

    const firstUserContent = typeof seen[0].content === "string"
      ? seen[0].content
      : "";
    expect(firstUserContent).toContain("Hello, who are you?");

    const secondUserContent = typeof seen[2].content === "string"
      ? seen[2].content
      : "";
    expect(secondUserContent).toContain("Are you still there?");
  });

  it("brand-new session (session.jsonl does not exist) does not throw and LLM sees only current user", async () => {
    const sessionDir = join(testDir, "brand-new-session");
    // 故意不 mkdir，让 sessionPath 完全不存在
    const sessionPaths = createSessionStorePaths(sessionDir);

    const cm = await ContextManager.createForSession({
      systemPromptModule: new SystemPromptContext("You are a test assistant."),
      sessionPath: sessionPaths.sessionPath,
    });
    expect(cm.getMessageCount()).toBe(0);

    const seenMessages: Message[][] = [];
    const deps = createDepsForSession(cm);
    deps.llm.setResponses([
      (context) => {
        seenMessages.push(snapshotMessages(context));
        return mockText("Hi.");
      },
    ]);

    const result = await runTurnWithAgent(
      {
        sessionId: "brand-new",
        turnId: "turn-1",
        userInput: "First time hello.",
      },
      deps,
    );

    expect(result.status).toBe("completed");
    expect(seenMessages.length).toBe(1);
    expect(seenMessages[0].length).toBe(1);
    expect(seenMessages[0][0].role).toBe("user");
  });
});

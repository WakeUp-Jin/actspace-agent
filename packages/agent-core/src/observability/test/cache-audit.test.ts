import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AssistantMessage, Context, Usage } from "../../messages";
import { createEmptyUsage } from "../../messages";
import { calculateCacheHitRatio, createCacheAuditTracker } from "../cache-audit";

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "actspace-cache-audit-"));
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

function usage(hit: number, miss: number): Usage {
  return {
    ...createEmptyUsage(),
    input: hit + miss,
    cacheRead: hit,
    cacheHit: hit,
    cacheMiss: miss,
    totalTokens: hit + miss,
  };
}

function assistantWithUsage(cacheUsage: Usage): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: "ok" }],
    model: "deepseek-v4-pro",
    provider: "deepseek",
    usage: cacheUsage,
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function context(messages: Context["messages"]): Context {
  return {
    systemPrompt: "You are actspace.",
    tools: [
      {
        name: "read_file",
        description: "Read file",
        parameters: { type: "object" },
      },
    ],
    messages,
  };
}

async function readJson(path: string): Promise<any> {
  return JSON.parse(await readFile(path, "utf8"));
}

describe("CacheAuditTracker", () => {
  it("calculates cache hit ratio only when provider exposes cache denominator", () => {
    expect(calculateCacheHitRatio(usage(90, 10))).toEqual({ hit: 90, miss: 10, ratio: 0.9 });
    expect(calculateCacheHitRatio(createEmptyUsage())).toEqual({ hit: 0, miss: 0, ratio: undefined });
  });

  it("writes rolling context normally and freezes previous/current snapshots on low cache", async () => {
    const tracker = createCacheAuditTracker({
      rootDir: testDir,
      sessionId: "session-a",
      agentRunId: "turn-a",
      provider: "deepseek",
      model: "deepseek-v4-pro",
      modelId: "deepseek-v4-pro",
      now: () => new Date("2026-05-31T15:30:12.123Z"),
    });

    const previousContext = context([
      { role: "user", content: "first question", timestamp: 1 },
    ]);
    const previousCall = await tracker.beforeLlmCall(previousContext, {
      callId: "call-prev",
      turnIndex: 1,
    });
    const previousMeta = await tracker.afterLlmCall(previousCall, assistantWithUsage(usage(95, 5)));

    expect(previousMeta).toEqual({ cacheHitRatio: 0.95 });
    const sessionDir = join(testDir, "session-a");
    const lastSnapshot = await readJson(join(sessionDir, "last.context.json"));
    expect(lastSnapshot.context.messages[0].content).toBe("first question");

    const currentContext = context([
      { role: "user", content: "rewritten first question", timestamp: 1 },
      { role: "user", content: "second question", timestamp: 2 },
    ]);
    const currentCall = await tracker.beforeLlmCall(currentContext, {
      callId: "call-low",
      turnIndex: 2,
    });
    const lowMeta = await tracker.afterLlmCall(currentCall, assistantWithUsage(usage(40, 60)));

    expect(lowMeta).toMatchObject({
      cacheStatus: true,
      cacheHitRatio: 0.4,
    });
    expect(lowMeta?.cacheAuditId).toContain("call-low");

    const auditDir = join(sessionDir, lowMeta?.cacheAuditId ?? "");
    const auditFiles = await readdir(auditDir);
    expect(auditFiles.sort()).toEqual([
      "current.context.json",
      "diff.txt",
      "previous.context.json",
      "summary.json",
    ]);

    const summary = await readJson(join(auditDir, "summary.json"));
    expect(summary).toMatchObject({
      cacheStatus: true,
      cacheHitRatio: 0.4,
      cacheHitTokens: 40,
      cacheMissTokens: 60,
      suspectBeforeSend: true,
      prefixChanged: false,
      appendOnlyBroken: true,
      firstChangedMessageIndex: 0,
    });

    const previousSnapshot = await readJson(join(auditDir, "previous.context.json"));
    const currentSnapshot = await readJson(join(auditDir, "current.context.json"));
    expect(previousSnapshot.context.messages[0].content).toBe("first question");
    expect(currentSnapshot.context.messages[0].content).toBe("rewritten first question");

    const diff = await readFile(join(auditDir, "diff.txt"), "utf8");
    expect(diff).toContain("append-only broken: yes");
    expect(diff).toContain("first changed message index: 0");
  });
});

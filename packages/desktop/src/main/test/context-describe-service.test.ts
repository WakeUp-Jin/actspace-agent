// @vitest-environment node
// 该服务在构造阶段会实例化 Anthropic SDK 客户端，jsdom（browser-like）会拒绝运行；
// 真实 Electron main 进程是 Node 环境，这里用 node 环境对齐线上行为。
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMeta, MAIN_AGENT_SYSTEM_PROMPT } from "@actspace/agent-core";
import { describeSessionContext } from "../context-describe-service";
import type { AppDataRoots } from "../agent-turn";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeRoots(): Promise<AppDataRoots> {
  const dataRoot = await mkdtemp(join(tmpdir(), "actspace-ctx-"));
  created.push(dataRoot);
  const sessionRoot = join(dataRoot, "sessions");
  await mkdir(sessionRoot, { recursive: true });
  return {
    dataRoot,
    sessionRoot,
    logRoot: join(dataRoot, "logs"),
    tmpRoot: join(dataRoot, "tmp"),
    defaultWorkspaceRoot: dataRoot,
    workspaceRoot: dataRoot,
  };
}

describe("describeSessionContext", () => {
  it("rebuilds a session's context with per-item entries (no LLM call)", async () => {
    const roots = await makeRoots();
    const sessionId = "session-ctx";
    const sessionDir = join(roots.sessionRoot, sessionId);
    await mkdir(sessionDir, { recursive: true });
    await createMeta(join(sessionDir, "meta.json"), sessionId, "刘备");
    await writeFile(join(sessionDir, "session.jsonl"), "", "utf8");

    const state = await describeSessionContext({ sessionId }, roots);

    expect(state).not.toBeNull();
    // 工具定义始终有内容：重建后应逐个工具成条，title=工具名、preview=完整描述
    // （这正是「Tools 有 token 却无内容」的修复点）。
    const tools = state?.entries.filter((e) => e.kind === "toolDefinitions") ?? [];
    expect(tools.length).toBeGreaterThan(0);
    expect((tools[0]?.title ?? "").length).toBeGreaterThan(0);
    expect(tools.some((entry) => (entry.preview ?? "").length > 0)).toBe(true);
    const systemPrompt = state?.entries.find((e) => e.kind === "systemPrompt");
    expect(systemPrompt?.title).toBe("Main agent system prompt");
    expect(systemPrompt?.preview).toBe(MAIN_AGENT_SYSTEM_PROMPT);
    const systemBucket = state?.buckets.find((b) => (b.key ?? b.name) === "systemPrompt");
    expect(systemBucket?.tokens ?? 0).toBeGreaterThan(0);
  });

  it("returns null when the session meta does not exist", async () => {
    const roots = await makeRoots();
    const state = await describeSessionContext({ sessionId: "missing" }, roots);
    expect(state).toBeNull();
  });
});

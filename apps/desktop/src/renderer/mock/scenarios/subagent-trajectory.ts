import type { MessageBlock } from "@actspace/shared";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { MockClock } from "../clock";
import type { MockHandlers } from "../handlers";
import { appendMockMessage, createMockSession, type MockDb, type MockSession } from "../mock-db";
import { seedSession, lastRunId } from "./seed";

/**
 * 子智能体轨迹：父会话委派一次 Explore，父轨迹只留 `agent` 一行；
 * 点开这一行的详情「查看轨迹」，右侧子 Agent 面板显示子会话自己的轨迹。
 */

const CHILD_ID = "mock-subagent-durable";
const SRC = "pi/packages/durable/src";

function appendTool(db: MockDb, session: MockSession, runId: string, name: string, args: Record<string, RuntimeV2JsonValue>, summary: string, delegation?: { childSessionId: string; presetId: string }): void {
  const message = appendMockMessage(db, session, "tool", "", runId);
  session.messages[session.messages.length - 1] = { ...message, role: "tool", tool: { name, args, result: { status: "completed", summary }, ...(delegation ? { delegation } : {}) } };
}

const read = (db: MockDb, session: MockSession, runId: string, path: string) =>
  appendTool(db, session, runId, "read_file", { path: `${SRC}/${path}` }, `Read ${SRC}/${path}`);

function seedChild(db: MockDb, parent: MockSession): MockSession {
  const child = createMockSession(db, { id: CHILD_ID, title: "查看 durable 存储层", updatedAt: parent.updatedAt });
  child.parentSessionId = parent.id;
  const run = db.nextId("seed-run");
  appendMockMessage(db, child, "user", `阅读 ${SRC} 下的 session 与 storage 模块，说明事务提交流程和 SQLite 表结构，结论用中文。`, run);
  appendMockMessage(db, child, "assistant", "I'll list the source directory first to see how session/ and storage/ are laid out.", run);
  appendTool(db, child, run, "list_directory", { path: SRC }, `Listed ${SRC}`);
  appendTool(db, child, run, "glob", { pattern: "**/*.ts", path: SRC }, "Found 81 files");
  appendMockMessage(db, child, "assistant", "Reading session.ts and transaction.ts to trace commit/prepare.", run);
  read(db, child, run, "session/session.ts");
  read(db, child, run, "session/transaction.ts");
  read(db, child, run, "session/observation.ts");
  appendMockMessage(db, child, "assistant", "Now the storage layer: migrations define the tables.", run);
  read(db, child, run, "storage/sqlite/migrations.ts");
  appendTool(db, child, run, "grep", { pattern: "^(export )?(class|function)", path: SRC }, "Found 48 matches");
  appendMockMessage(db, child, "assistant", "结论：Session 通过 Transaction 先 prepare（校验、排序）再 commit（单个 SQLite 事务写入 entries）；forks 表记录分叉点，documents 表保存文档快照。", run);
  return child;
}

export function subagentTrajectoryScenario({ db }: MockClock): MockHandlers | void {
  const parent = seedSession(db, { title: "查看pi-durable设计", minutesAgo: 1, turns: [["帮我看一下 pi-durable 的设计，重点是会话事务和存储层。", null]] });
  const run = lastRunId(parent);
  appendMockMessage(db, parent, "assistant", "I'll get an overview of the package layout first, then delegate a focused read of the session/storage modules.", run);
  appendTool(db, parent, run, "bash", { command: `ls ${SRC}` }, "Bash completed in 18ms (exit 0, sandboxed=true).");
  appendMockMessage(db, parent, "assistant", "Let me delegate reading session/ and storage/ to an explorer so I can look at harness/ in parallel.", run);
  const child = seedChild(db, parent);
  appendTool(db, parent, run, "agent", { description: "查看 durable 存储层", agent: "explore" }, "agent completed", { childSessionId: child.id, presetId: "explore" });
  appendMockMessage(db, parent, "assistant", "Now let me look at harness/generation.ts and documents.ts briefly.", run);
  read(db, parent, run, "harness/generation.ts");
  read(db, parent, run, "documents.ts");
  appendMockMessage(db, parent, "assistant", "pi-durable 把会话写成追加式事件日志：事务分 prepare / commit 两段，SQLite 里 entries 与 forks 两张主表。", run);

  const agent: Extract<MessageBlock, { kind: "agent" }> = {
    kind: "agent",
    id: `subagent:${child.id}`,
    description: "查看 durable 存储层",
    displayText: "查看 durable 存储层",
    subagentType: "explore",
    agentKind: "explore",
    status: "completed",
    createdAt: child.createdAt,
    display: "panel",
    summary: child.messages[child.messages.length - 1]!.content,
    stats: { durationMs: 38_200, toolCallCount: 7 },
    transcriptRef: { kind: "subagent_transcript", sessionId: parent.id, agentRunId: run, runId: child.id },
  };
  return {
    sessions: {
      getSubagents: async ({ sessionId }) => sessionId === parent.id ? [agent] : [],
      getSubAgentTranscript: async () => [],
    },
  };
}

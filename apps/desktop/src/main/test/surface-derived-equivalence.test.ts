// @vitest-environment node
/**
 * 对话内容只存一份（agent-spec-surface-derived.md §9）：surface 只做标记、节点从 data 推出之后，
 * 同一段对话的五种读取结果必须与改前完全一致。
 *
 * - `fixtures/surface-derived/old-format.jsonl`：run7 父会话（工具调用、4 次子 Agent 通知的 Inbox claim），
 *   末尾用改前的写入方补了一段崩溃恢复（tool/recovery-outcome）和一次压缩替换（surface/replaced）。
 *   生成脚本 `make-fixture.mjs`，只在改前的代码（0e0070a3）上跑。
 * - `fixtures/surface-derived/expected.json`：改前的代码读旧格式得到的五种结果。
 *
 * 测试里把旧格式按规范 §4.2 转成新格式，用现在的代码读一遍，与 expected 深度相等。
 */
// expected.json 里的转写时间戳是在 +08:00 生成的；renderTranscript 用本地时区，这里固定住以免在 UTC 机器上失败。
process.env.TZ = "Asia/Shanghai";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ContextEngine } from "@actspace/context-engine";
import type { SessionEventEnvelopeV1, SessionHeaderV1 } from "@actspace/session-journal";
import { foldTranscript, renderTranscript } from "@actspace/session-transcript";
import { foldContextEstimate, viewContextEstimate } from "@actspace/shared";
import type { RuntimeSessionSnapshot } from "@actspace/shared/runtime-v2";
import { projectChatSession } from "@actspace/client/sessions";
import { SURFACE_FIXTURES as FIXTURES, convert, readOldFixture, seedJournal } from "./surface-fixture";

function project(_header: SessionHeaderV1, events: readonly SessionEventEnvelopeV1[]) {
  return seedJournal(events);
}

it("derives the same conversation, model request, transcript, estimate and chat projection as the old double-stored format", async () => {
  const { header, oldEvents } = readOldFixture();
  const expected = JSON.parse(readFileSync(join(FIXTURES, "expected.json"), "utf8"));
  const events = oldEvents.map(convert);
  // 新格式的日志里不再有任何 surface.node。
  expect(events.some(event => event.surface !== null && "node" in event.surface)).toBe(false);
  expect(events.filter(event => event.surface !== null).map(event => event.type)).toEqual(expect.arrayContaining(["user/message", "assistant/message", "tool/result", "agent/inbox/spliced", "tool/recovery-outcome", "surface/replaced"]));

  const journal = project(header, events);
  const surface = journal.surface;
  // 1) 折叠出的对话。条目上的 compactionId 是 1a300840 之后才记的，不进 messages 与投影规则，golden 里没有。
  expect(JSON.parse(JSON.stringify(surface.entries, (key, value) => key === "compactionId" ? undefined : value))).toEqual(expected.entries);

  // 2) 上下文引擎发给模型的 messages。
  const request = { sessionId: header.sessionId, requestId: "golden", routeId: "default", model: "golden", options: {} };
  const engine = new ContextEngine({ resolve: () => ({ request, content: { system: { sections: [], modelFacts: [] }, conversation: surface, supplements: [], tools: [] },
    status: { throughJournalSeq: journal.lastSeq, cycle: 0, paths: [], facts: [], plugins: {} } }) } as never);
  const llm = await engine.toLlmInput(await engine.getContext(request as never));
  expect(JSON.parse(JSON.stringify(llm.messages))).toEqual(expected.llmMessages);

  // 3) 转写。
  expect(renderTranscript(header, foldTranscript(journal.events))).toBe(expected.transcript);

  // 4) 上下文估算。
  expect(JSON.parse(JSON.stringify(viewContextEstimate(foldContextEstimate(journal.events))))).toEqual(expected.estimate);

  // 5) client 投影：snapshot.messages 与 durable-session 投影规则一致（来自折叠后的 entries）。
  const messages = surface.entries.map(entry => ({ kind: entry.node.kind, messageId: entry.node.messageId, content: entry.node.content, ...(entry.node.kind === "tool-result" ? { callId: entry.node.callId } : {}) }));
  const snapshot = { kind: "session-snapshot", schemaVersion: 1, sessionId: header.sessionId, createdAt: header.createdAt, updatedAt: header.createdAt, workspaceRoot: "/w", throughJournalSeq: journal.lastSeq,
    permissionMode: "default", sessionGrants: [], accessState: "read-write", agentForm: "agent", metadata: { title: null, pinned: false, archived: false }, messages, tools: [], pendingInbox: [], todos: [], delegations: [],
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: null },
    activity: { turnCount: 0, completedTurnCount: 0, stepCount: 0, activeTurnId: null, activeStepId: null, compactionCount: 0, activeCompactionId: null, lastCompactionSummary: null, timing: { llmMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 } }, lineage: null } as unknown as RuntimeSessionSnapshot;
  const chat = projectChatSession(snapshot, journal.events, "/w");
  expect(JSON.parse(JSON.stringify(chat.events))).toEqual(expected.chatEvents);
  expect(JSON.parse(JSON.stringify(chat.messageBlocks))).toEqual(expected.chatBlocks);
});

it("rejects the old double-stored format outright", () => {
  const [, ...lines] = readFileSync(join(FIXTURES, "old-format.jsonl"), "utf8").trim().split("\n");
  const oldEvents = lines.map(line => JSON.parse(line) as SessionEventEnvelopeV1);
  expect(() => project(null as never, oldEvents)).toThrow(/old Session format/);
});

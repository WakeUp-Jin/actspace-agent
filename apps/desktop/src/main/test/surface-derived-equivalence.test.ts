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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ContextEngine } from "@actspace/context-engine";
import { SessionJournal, createCoreCodecRegistry, type EventCodec, type SessionEventEnvelopeV1, type SessionHeaderV1 } from "@actspace/session-journal";
import { foldTranscript, renderTranscript } from "@actspace/session-transcript";
import { foldContextEstimate, viewContextEstimate } from "@actspace/shared";
import type { RuntimeV2JsonValue, RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";
import { projectChatSession } from "@actspace/client/sessions";

const FIXTURES = join(__dirname, "fixtures", "surface-derived");

type OldEvent = Omit<SessionEventEnvelopeV1, "surface" | "data"> & { data: Record<string, RuntimeV2JsonValue>; surface: (Record<string, RuntimeV2JsonValue> & { node?: Record<string, RuntimeV2JsonValue> }) | null };

/** 旧格式 → 新格式：节点内容搬进 data 对应字段，surface 只留标记（与 T6 转换脚本同一套规则）。 */
function convert(event: OldEvent): SessionEventEnvelopeV1 {
  if (!event.surface?.node) return event as unknown as SessionEventEnvelopeV1;
  const { node, ...marker } = event.surface;
  const data = { ...event.data };
  switch (event.type) {
    case "user/message": case "assistant/message": case "agent/inbox/spliced": case "tool/recovery-outcome":
      data.content = node.content!; break;
    case "tool/result":
      // 旧格式里 node.content 就是 modelOutput，isError 就是 status !== "completed"：转换时不搬，只核对。
      expect(node.content).toEqual(data.modelOutput);
      expect(node.isError).toBe(data.status !== "completed");
      break;
    case "surface/replaced":
      data.node = node; break;
    default:
      throw new Error(`unexpected surface on ${event.type}`);
  }
  return { ...event, data, surface: marker } as unknown as SessionEventEnvelopeV1;
}

function project(header: SessionHeaderV1, events: readonly SessionEventEnvelopeV1[]) {
  const known = createCoreCodecRegistry();
  // 插件事件（agent-service task/run、context supplement）与 surface 无关，用宽松 codec 登记，只为回放。
  const pluginCodecs = [...new Map(events.filter(event => known.get(event.type) === undefined).map(event => [event.type, {
    type: event.type, ownerPluginId: event.source.ownerPluginId, currentVersion: event.eventVersion, criticality: event.criticality, validate: () => undefined,
  } as EventCodec])).values()];
  const journal = new SessionJournal({ registry: createCoreCodecRegistry(pluginCodecs), seed: events });
  return journal;
}

it("derives the same conversation, model request, transcript, estimate and chat projection as the old double-stored format", async () => {
  const [headerLine, ...lines] = readFileSync(join(FIXTURES, "old-format.jsonl"), "utf8").trim().split("\n");
  const header = JSON.parse(headerLine!) as SessionHeaderV1;
  const oldEvents = lines.map(line => JSON.parse(line) as OldEvent);
  const expected = JSON.parse(readFileSync(join(FIXTURES, "expected.json"), "utf8"));
  const events = oldEvents.map(convert);
  // 新格式的日志里不再有任何 surface.node。
  expect(events.some(event => event.surface !== null && "node" in event.surface)).toBe(false);
  expect(events.filter(event => event.surface !== null).map(event => event.type)).toEqual(expect.arrayContaining(["user/message", "assistant/message", "tool/result", "agent/inbox/spliced", "tool/recovery-outcome", "surface/replaced"]));

  const journal = project(header, events);
  const surface = journal.surface;
  // 1) 折叠出的对话。
  expect(JSON.parse(JSON.stringify(surface.entries))).toEqual(expected.entries);

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
    activity: { turnCount: 0, completedTurnCount: 0, stepCount: 0, activeTurnId: null, activeStepId: null, compactionCount: 0, activeCompactionId: null, lastCompactionSummary: null, timing: { llmMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 } }, lineage: null } as unknown as RuntimeV2SessionSnapshot;
  const chat = projectChatSession(snapshot, journal.events, "/w");
  expect(JSON.parse(JSON.stringify(chat.events))).toEqual(expected.chatEvents);
  expect(JSON.parse(JSON.stringify(chat.messageBlocks))).toEqual(expected.chatBlocks);
});

it("rejects the old double-stored format outright", () => {
  const [, ...lines] = readFileSync(join(FIXTURES, "old-format.jsonl"), "utf8").trim().split("\n");
  const oldEvents = lines.map(line => JSON.parse(line) as SessionEventEnvelopeV1);
  expect(() => project(null as never, oldEvents)).toThrow(/old Session format/);
});

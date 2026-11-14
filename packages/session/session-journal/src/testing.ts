/**
 * 规模测试的基础件（docs/coding-standards/perf-memory-conventions.md §8）：
 * - `syntheticSessionEvents`：按条数生成一份合法的长会话（多轮对话、工具调用、定期压缩）；
 * - `countingHistory`：包住归档历史，统计从「文件」读了多少条，用来断言某个操作的读取量不随会话长度增长；
 * - `syntheticJournal`：把合成会话装进一个只保留末尾若干条在内存、其余走计数历史的 Journal，模拟长会话打开后的状态。
 *
 * 只用于测试，不在产品代码里引用。
 */
import type { RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import { createCoreCodecRegistry } from "./core-codecs.js";
import type { SessionEventCandidateV1, SessionEventEnvelopeV1 } from "./event-envelope.js";
import type { SessionEventHistory } from "./history.js";
import { SessionJournal } from "./journal.js";

export type SyntheticSessionOptions = {
  /** 每隔多少轮压缩一次，把之前的对话替换成一条摘要；0 表示不压缩。默认 20。 */
  readonly compactEvery?: number;
  /** 每轮几次工具调用。默认 2。 */
  readonly toolCallsPerTurn?: number;
  /** 每条消息正文的字数，用来控制会话字节大小。默认 200。 */
  readonly textLength?: number;
};

const SOURCE = { ownerPluginId: "@actspace/core" } as const;
const TIME = "2026-11-07T00:00:00.000Z";

/**
 * 生成至少 `count` 条事件的合成会话（按整轮生成，最后一轮可能多出几条）。
 * 每轮：turn/start、step/start、user/message、request/header、request/context、若干 tool/call + tool/result、assistant/message、step/end、turn/end。
 */
export function syntheticSessionEvents(
  count: number,
  options: SyntheticSessionOptions = {},
): readonly SessionEventEnvelopeV1[] {
  const compactEvery = options.compactEvery ?? 20;
  const toolCalls = options.toolCallsPerTurn ?? 2;
  const text = "x".repeat(options.textLength ?? 200);
  const journal = new SessionJournal({
    registry: createCoreCodecRegistry(),
    now: () => TIME,
    retainedEvents: Number.MAX_SAFE_INTEGER,
    retainedBytes: Number.MAX_SAFE_INTEGER,
  });
  const append = (type: string, data: Record<string, RuntimeJsonValue>, extra: Partial<SessionEventCandidateV1> = {}) =>
    journal.append({ type, eventVersion: 1, source: SOURCE, data, surface: null, ...extra });
  for (let turn = 0; journal.lastSeq + 1 < count; turn += 1) {
    const turnId = `turn-${turn}`;
    const stepId = `step-${turn}`;
    append("turn/start", { turnId });
    append("step/start", { turnId, stepId });
    append("user/message", { messageId: `user-${turn}`, content: `${turn} ${text}` }, { surface: { kind: "append" } });
    append("request/header", { requestId: `request-${turn}`, turnId, stepId });
    append("request/context", { requestId: `request-${turn}`, turnId, stepId });
    for (let call = 0; call < toolCalls; call += 1) {
      const callId = `call-${turn}-${call}`;
      append("tool/call", { callId, name: "read_file", turnId, stepId, args: { path: `file-${call}.ts` } });
      append(
        "tool/result",
        { callId, name: "read_file", status: "completed", modelOutput: [{ type: "text", text }] },
        { surface: { kind: "append" } },
      );
    }
    append(
      "assistant/message",
      {
        messageId: `assistant-${turn}`,
        requestId: `request-${turn}`,
        content: `${turn} ${text}`,
        finishReason: "stop",
      },
      { surface: { kind: "append" } },
    );
    append("step/end", { turnId, stepId, status: "completed" });
    append("turn/end", { turnId, status: "completed" });
    if (compactEvery > 0 && (turn + 1) % compactEvery === 0) compact(journal, append, `compact-${turn}`);
  }
  return journal.readEvents();
}

/** 把当前对话除最后一条之外全部替换成一条摘要（和真实压缩一样走 compaction/* + surface/replaced）。 */
function compact(
  journal: SessionJournal,
  append: (type: string, data: Record<string, RuntimeJsonValue>, extra?: Partial<SessionEventCandidateV1>) => unknown,
  compactionId: string,
) {
  const entries = journal.surface.entries;
  const end = entries.length - 1;
  if (end < 2) return;
  const sourceEventSeqs = [...new Set(entries.slice(0, end).flatMap((entry) => entry.sourceEventSeqs))].sort(
    (a, b) => a - b,
  );
  append("compaction/start", { compactionId, start: 0, end });
  append("compaction/summary", { compactionId, summaryDigest: compactionId });
  append(
    "surface/replaced",
    {
      compactionId,
      sourceEventSeqs,
      replacedTokens: { conversation: 0, summarizedConversation: 0 },
      estimatorVersion: "synthetic",
      node: { kind: "user", messageId: `summary-${compactionId}`, content: `summary ${compactionId}` },
    },
    {
      provenance: { sourceEventSeqs, contributorIds: ["compactor"], runtimeSelectionSeq: null },
      surface: { kind: "replace", start: 0, end, sourceEventSeqs },
    },
  );
  append("compaction/end", { compactionId, summaryDigest: compactionId });
}

export type CountingHistory = SessionEventHistory & {
  /** 一共读出了多少条事件（同一条读两次算两次）。 */
  readonly eventsRead: number;
  /** 调用了几次 `readEvents`。 */
  readonly calls: number;
  reset(): void;
};

/** 包住一份事件数组当作归档历史，统计读取量。 */
export function countingHistory(events: readonly SessionEventEnvelopeV1[]): CountingHistory {
  let eventsRead = 0;
  let calls = 0;
  return {
    readEvents(start, end) {
      calls += 1;
      eventsRead += end - start;
      return events.slice(start, end);
    },
    get eventsRead() {
      return eventsRead;
    },
    get calls() {
      return calls;
    },
    reset() {
      eventsRead = 0;
      calls = 0;
    },
  };
}

/**
 * 一个装着合成会话的 Journal：只有末尾 `retainedEvents` 条（默认 512，和产品默认一致）在内存里，
 * 更早的都要经 `history` 读取，读了多少条看 `history.eventsRead`。
 */
export function syntheticJournal(
  count: number,
  options: SyntheticSessionOptions & { readonly retainedEvents?: number } = {},
): { journal: SessionJournal; history: CountingHistory; events: readonly SessionEventEnvelopeV1[] } {
  const events = syntheticSessionEvents(count, options);
  const history = countingHistory(events);
  const journal = new SessionJournal({
    registry: createCoreCodecRegistry(),
    now: () => TIME,
    seed: events,
    history,
    retainedEvents: options.retainedEvents ?? 512,
  });
  journal.releaseDurable(journal.lastSeq);
  history.reset();
  return { journal, history, events };
}

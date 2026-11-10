import completeFixture from "../fixtures/trajectory-complete.json";
import type { RuntimeV2JsonValue, RuntimeV2TrajectoryNode, RuntimeV2TrajectorySnapshot } from "@actspace/shared/runtime-v2";
import type { RequestLiveOutput } from "@actspace/client/live";

export type TrajectoryFixtureName = "complete" | "running" | "errors" | "long" | "empty" | "streaming" | "streaming-long";

/** Reject malformed fixtures before their identities enter the renderer. */
export function validateTrajectoryFixture(value: unknown): asserts value is RuntimeV2TrajectorySnapshot {
  const data = value as RuntimeV2TrajectorySnapshot | null;
  if (data?.kind !== "trajectory" || data.schemaVersion !== 1 || typeof data.sessionId !== "string" || !Array.isArray(data.nodes)) throw new Error("Invalid trajectory fixture envelope");
  const keys = new Set<string>();
  let previous = -1;
  for (const node of data.nodes) {
    if (typeof node.key !== "string" || keys.has(node.key) || node.sessionId !== data.sessionId || !Number.isInteger(node.eventSeq) || node.eventSeq <= previous || typeof node.eventType !== "string" || (node.time !== null && !Number.isFinite(Date.parse(node.time))) || node.data === undefined) throw new Error("Invalid trajectory fixture node");
    keys.add(node.key); previous = node.eventSeq;
  }
  if (data.throughJournalSeq < previous) throw new Error("Invalid trajectory fixture revision");
}
validateTrajectoryFixture(completeFixture);
const COMPLETE: RuntimeV2TrajectorySnapshot = completeFixture;
const VALID_NAMES = new Set<TrajectoryFixtureName>(["complete", "running", "errors", "long", "empty", "streaming", "streaming-long"]);

function isFixtureName(value: string | null | undefined): value is TrajectoryFixtureName {
  return value !== null && value !== undefined && VALID_NAMES.has(value as TrajectoryFixtureName);
}

/** Resolve the explicit renderer-only fixture flag. Missing/unknown flags return null. */
export function trajectoryFixtureName(input: string | URL | URLSearchParams = window.location.search): TrajectoryFixtureName | null {
  const params = typeof input === "string"
    ? new URLSearchParams(input.includes("?") ? input.slice(input.indexOf("?") + 1) : input)
    : input instanceof URL
      ? input.searchParams
      : input;
  const value = params.get("trajectoryFixture");
  return isFixtureName(value) ? value : null;
}

function cloneNode(node: RuntimeV2TrajectoryNode, changes: Partial<RuntimeV2TrajectoryNode> = {}): RuntimeV2TrajectoryNode {
  return { ...node, data: node.data, ...changes };
}

function snapshot(nodes: readonly RuntimeV2TrajectoryNode[], sessionId = "mock-trajectory-session"): RuntimeV2TrajectorySnapshot {
  return { kind: "trajectory", schemaVersion: 1, sessionId, throughJournalSeq: nodes.at(-1)?.eventSeq ?? -1, nodes };
}

function runningFixture(): RuntimeV2TrajectorySnapshot {
  const nodes = COMPLETE.nodes.filter(node => node.eventType !== "turn/end" && node.eventType !== "step/end" && node.eventType !== "tool/result");
  return snapshot(nodes);
}

function errorsFixture(): RuntimeV2TrajectorySnapshot {
  const nodes: RuntimeV2TrajectoryNode[] = COMPLETE.nodes.map(node => {
    const data = node.data as Record<string, RuntimeV2JsonValue>;
    if (node.eventType === "tool/call" && node.callId === "call-1-1-2") {
      return cloneNode(node, { data: { ...data, parentCallId: "call-1-1-1" } });
    }
    if (node.eventType === "tool/result" && node.callId === "call-1-1-2") {
      return cloneNode(node, { state: "failed", data: { ...(node.data as Record<string, RuntimeV2JsonValue>), status: "failed", error: "Command exited with code 1", result: "permission denied" } });
    }
    if (node.eventType === "permission/decided" && node.callId === "call-4-1-1") {
      return cloneNode(node, { data: { ...data, decision: "denied", kind: "deny" } });
    }
    if (node.eventType === "tool/result" && node.callId === "call-4-1-1") {
      return cloneNode(node, { state: "failed", data: { ...data, status: "failed", result: "用户拒绝了这条命令" } });
    }
    if (node.eventType === "assistant/message" && data.messageId === "assistant-5-1") {
      return cloneNode(node, { state: "failed", data: { ...data, finishReason: "failed", error: "Provider returned 503" } });
    }
    return node;
  });
  // 上下文行的两种来源：Context 插件的补充（op=add）和后台任务通知（inbox claim）。
  const extra = (after: (node: RuntimeV2TrajectoryNode) => boolean, eventType: string, data: Record<string, RuntimeV2JsonValue>, surface?: RuntimeV2JsonValue) => {
    const index = nodes.findIndex(after);
    const anchor = nodes[index];
    nodes.splice(index + 1, 0, { ...anchor, eventType, kind: "other", state: "observed", callId: null, data, ...(surface === undefined ? {} : { surface }) });
  };
  // 第 2 轮第 2 次请求换了提示词：提示词只在变化时记一条 request/system-prompt（agent-spec-request-record.md §3）。
  const initialPrompt = nodes.find(node => node.eventType === "request/system-prompt")!.data as Record<string, RuntimeV2JsonValue>;
  const changedSections = [{ id: "model-prompt", owner: "actspace.context-system", order: 0, content: "你是 ActSpace 的代码助手。\n本轮只检查文件，不修改。" }];
  extra(node => node.eventType === "request/header" && (node.data as Record<string, RuntimeV2JsonValue>).requestId === "request-2-2", "request/system-prompt",
    { ...initialPrompt, requestId: "request-2-2", turnId: "turn-2", stepId: "step-2-2", digest: "fixture-prompt-2", sections: changedSections });
  const content = "后台任务「pnpm build」已完成，退出码 0。";
  extra(node => node.eventType === "user/message" && (node.data as Record<string, RuntimeV2JsonValue>).messageId === "user-1", "plugin/actspace.context/supplement",
    { turnId: "turn-1", op: "add", owner: "actspace.context-runtime", id: "runtime-state", lifetime: "turn", content: "运行环境：macOS · 工作目录 actspace-agent · 本轮执行预算剩余 18 步" });
  extra(node => node.eventType === "turn/end" && (node.data as Record<string, RuntimeV2JsonValue>).turnId === "turn-1", "agent/inbox/spliced",
    { operation: "claim", messageId: "notice-task-build", target: "next-turn", source: "task_notification", taskId: "task-build", content }, { kind: "append" });
  // 插入后重排 eventSeq，保持 Journal 序号严格递增。
  return snapshot(nodes.map((node, eventSeq) => cloneNode(node, { eventSeq, key: `${node.sessionId}:${eventSeq}` })));
}

function longFixture(): RuntimeV2TrajectorySnapshot {
  const source = COMPLETE.nodes.filter(node => node.eventType !== "session/title-set");
  const nodes: RuntimeV2TrajectoryNode[] = [];
  const idFields = new Set(["turnId", "stepId", "requestId", "messageId", "callId", "toolCallId", "parentCallId", "assistantMessageId"]);
  for (let repeat = 0; repeat < 24; repeat += 1) {
    const remap = (value: RuntimeV2JsonValue, key = ""): RuntimeV2JsonValue => {
      if (typeof value === "string" && idFields.has(key)) return `batch-${repeat + 1}:${value}`;
      if (Array.isArray(value)) return value.map(item => remap(item));
      if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remap(v, k)]));
      return value;
    };
    for (const node of source) {
      const eventSeq = nodes.length;
      nodes.push(cloneNode(node, {
        key: `mock-long-session:${eventSeq}`, sessionId: "mock-long-session", eventSeq,
        callId: node.callId === null ? null : `batch-${repeat + 1}:${node.callId}`,
        time: new Date(Date.parse(node.time) + repeat * 360_000).toISOString(),
        data: remap(node.data),
      }));
    }
  }
  return snapshot(nodes, "mock-long-session");
}

function emptyFixture(): RuntimeV2TrajectorySnapshot {
  return snapshot([], "mock-empty-session");
}

const STREAMING_TEXT = "正在整理轨迹页面：先对齐工具栏和时间轴，再把表格的轮次标签、请求圆点和类型标签照 DeepSeek Harness 的尺寸重做。助手生成时，这一行的文字会在原地变长，行本身不闪、不重新挂载。最后检查右侧详情的概述、预览和原始内容三个页签。";
const STREAMING_CHUNK = 6;
/** Number of frames the streaming replay emits before it stops growing. */
export const STREAMING_FRAMES = Math.ceil(STREAMING_TEXT.length / STREAMING_CHUNK);

/** A streaming fixture frame: the Journal (the running request still open) and the live run's output. */
export type TrajectoryFixtureFrame = { readonly snapshot: RuntimeV2TrajectorySnapshot; readonly live: ReadonlyMap<string, RequestLiveOutput> };

const isRunningChunk = (node: RuntimeV2TrajectoryNode) => node.eventType === "assistant/chunk" && String((node.data as Record<string, RuntimeV2JsonValue>).messageId).endsWith("assistant-running");
const liveOf = (node: RuntimeV2TrajectoryNode, text: string): ReadonlyMap<string, RequestLiveOutput> => {
  const data = node.data as Record<string, string>;
  return text === "" ? new Map() : new Map([[data.requestId, { messageId: data.messageId, text, thinking: "", calls: new Map() }]]);
};

/**
 * The complete fixture's running turn as a new Session streams it: the Journal ends at the open request and
 * the reply grows in the live run by `frame` chunks. Frames 0…STREAMING_FRAMES review in-place streaming without IPC.
 */
export function streamingFixture(frame: number): TrajectoryFixtureFrame {
  const template = COMPLETE.nodes.find(isRunningChunk)!;
  const base = COMPLETE.nodes.filter(node => node.eventSeq < template.eventSeq);
  return { snapshot: snapshot(base, template.sessionId), live: liveOf(template, STREAMING_TEXT.slice(0, Math.min(frame, STREAMING_FRAMES) * STREAMING_CHUNK)) };
}

/** Chunks in the `streaming-long` reply once its replay finishes. */
export const STREAMING_LONG_CHUNKS = 2000;

/**
 * The long fixture with one reply still streaming in its last turn, grown by `chunks` chunks.
 * Earlier batches drop their unfinished reply and its request, so exactly one call is streaming.
 */
let streamingLongBase: { readonly template: RuntimeV2TrajectoryNode; readonly base: RuntimeV2TrajectorySnapshot } | null = null;

export function streamingLongFixture(chunks: number): TrajectoryFixtureFrame {
  if (streamingLongBase === null) {
    const nodes = longFixture().nodes;
    const template = nodes.filter(isRunningChunk).at(-1)!;
    const open = new Set(nodes.filter(isRunningChunk).map(node => (node.data as Record<string, string>).requestId));
    open.delete((template.data as Record<string, string>).requestId);
    const base = nodes.filter(node => !isRunningChunk(node) && !(node.eventType.startsWith("request/") && open.has((node.data as Record<string, string>).requestId)));
    streamingLongBase = { template, base: snapshot(base, template.sessionId) };
  }
  const { template, base } = streamingLongBase;
  let text = "";
  for (let index = 0; index < Math.min(chunks, STREAMING_LONG_CHUNKS); index += 1) {
    const offset = (index * STREAMING_CHUNK) % STREAMING_TEXT.length;
    text += STREAMING_TEXT.slice(offset, offset + STREAMING_CHUNK);
  }
  return { snapshot: base, live: liveOf(template, text) };
}

/** Dev replay for the streaming fixtures: frame count and the Journal plus live output at each frame. */
export function streamingReplay(name: TrajectoryFixtureName | null): { readonly frames: number; readonly frame: (index: number) => TrajectoryFixtureFrame } | null {
  if (name === "streaming") return { frames: STREAMING_FRAMES, frame: streamingFixture };
  if (name === "streaming-long") return { frames: STREAMING_LONG_CHUNKS / 20, frame: index => streamingLongFixture(index * 20) };
  return null;
}

/** Build one deterministic fixture while keeping the checked-in complete fixture as the source of truth. */
export function loadTrajectoryFixture(name: TrajectoryFixtureName): RuntimeV2TrajectorySnapshot {
  switch (name) {
    case "complete": return COMPLETE;
    case "running": return runningFixture();
    case "errors": return errorsFixture();
    case "long": return longFixture();
    case "empty": return emptyFixture();
    case "streaming": return streamingFixture(0).snapshot;
    case "streaming-long": return streamingLongFixture(0).snapshot;
  }
}

/** Load a fixture only when the URL explicitly requests one; normal sessions return null. */
export function loadTrajectoryFixtureFromUrl(input: string | URL | URLSearchParams = window.location.search): RuntimeV2TrajectorySnapshot | null {
  const name = trajectoryFixtureName(input);
  return name === null ? null : loadTrajectoryFixture(name);
}

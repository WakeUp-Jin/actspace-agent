import completeFixture from "../fixtures/trajectory-complete.json";
import type { RuntimeV2JsonValue, RuntimeV2TrajectoryNode, RuntimeV2TrajectorySnapshot } from "@actspace/shared/runtime-v2";

export type TrajectoryFixtureName = "complete" | "running" | "errors" | "long" | "empty";

/** Reject malformed fixtures before their identities enter the renderer. */
export function validateTrajectoryFixture(value: unknown): asserts value is RuntimeV2TrajectorySnapshot {
  const data = value as RuntimeV2TrajectorySnapshot | null;
  if (!data || data.kind !== "trajectory" || data.schemaVersion !== 1 || typeof data.sessionId !== "string" || !Array.isArray(data.nodes)) throw new Error("Invalid trajectory fixture envelope");
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
const VALID_NAMES = new Set<TrajectoryFixtureName>(["complete", "running", "errors", "long", "empty"]);

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
  const nodes = COMPLETE.nodes.map(node => {
    const data = node.data as Record<string, RuntimeV2JsonValue>;
    if (node.eventType === "request/header" && data.requestId === "request-2-2") {
      return cloneNode(node, { data: { ...data, prompt: { ...(data.prompt as Record<string, RuntimeV2JsonValue>), systemPrompt: "你是 ActSpace 的代码助手。\n本轮只检查文件，不修改。" } } });
    }
    if (node.eventType === "tool/call" && node.callId === "call-1-1-2") {
      return cloneNode(node, { data: { ...data, parentCallId: "call-1-1-1" } });
    }
    if (node.eventType === "tool/result" && node.callId === "call-1-1-2") {
      return cloneNode(node, { state: "failed", data: { ...(node.data as Record<string, RuntimeV2JsonValue>), status: "failed", error: "Command exited with code 1", result: "permission denied" } });
    }
    return node;
  });
  return snapshot(nodes);
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
        time: node.time === null ? null : new Date(Date.parse(node.time) + repeat * 360_000).toISOString(),
        data: remap(node.data),
      }));
    }
  }
  return snapshot(nodes, "mock-long-session");
}

function emptyFixture(): RuntimeV2TrajectorySnapshot {
  return snapshot([], "mock-empty-session");
}

/** Build one deterministic fixture while keeping the checked-in complete fixture as the source of truth. */
export function loadTrajectoryFixture(name: TrajectoryFixtureName): RuntimeV2TrajectorySnapshot {
  switch (name) {
    case "complete": return COMPLETE;
    case "running": return runningFixture();
    case "errors": return errorsFixture();
    case "long": return longFixture();
    case "empty": return emptyFixture();
  }
}

/** Load a fixture only when the URL explicitly requests one; normal sessions return null. */
export function loadTrajectoryFixtureFromUrl(input: string | URL | URLSearchParams = window.location.search): RuntimeV2TrajectorySnapshot | null {
  const name = trajectoryFixtureName(input);
  return name === null ? null : loadTrajectoryFixture(name);
}

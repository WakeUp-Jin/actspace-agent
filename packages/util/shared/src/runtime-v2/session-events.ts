import type { RuntimeV2JsonValue } from "./host-dto";
export type SessionEventCriticality = "required" | "ignorable";

export type SessionEventSourceV1 = {
  readonly ownerPluginId: string;
  readonly agentId?: string;
  readonly turnId?: string;
  readonly stepId?: string;
};

export type SessionEventProvenanceV1 = {
  readonly sourceEventSeqs: readonly number[];
  readonly contributorIds: readonly string[];
  readonly runtimeSelectionSeq: number | null;
};

export type SessionSurfaceNodeV1 =
  | {
      readonly kind: "user";
      readonly messageId: string;
      readonly content: RuntimeV2JsonValue;
    }
  | {
      readonly kind: "assistant";
      readonly messageId: string;
      readonly content: RuntimeV2JsonValue;
    }
  | {
      readonly kind: "tool-result";
      readonly messageId: string;
      readonly callId: string;
      readonly content: RuntimeV2JsonValue;
      readonly isError: boolean;
    };

/**
 * 事件怎样进入模型对话：`append` 追加一个节点，`replace` 把 `[start, end)` 换成一个节点。
 * 只是标记，不带节点内容；节点由 `surfaceNode(event)` 从 `data` 推出（agent-spec-surface-derived.md）。
 */
export type SessionSurfaceOperationV1 =
  | { readonly kind: "append" }
  | {
      readonly kind: "replace";
      readonly start: number;
      readonly end: number;
      readonly sourceEventSeqs: readonly number[];
    };

export type SessionEventEnvelopeV1 = {
  readonly recordKind: "event";
  readonly seq: number;
  readonly type: string;
  readonly eventVersion: number;
  readonly criticality: SessionEventCriticality;
  readonly time: string;
  readonly source: SessionEventSourceV1;
  readonly data: RuntimeV2JsonValue;
  readonly surface: SessionSurfaceOperationV1 | null;
  readonly provenance: SessionEventProvenanceV1;
};

export type SessionEventCandidateV1 = Omit<
  SessionEventEnvelopeV1,
  "recordKind" | "seq" | "time" | "criticality" | "provenance"
> & { readonly provenance?: SessionEventProvenanceV1 };

/** `surfaceNode` 只需要这三个字段，client 和渲染进程里的事件形状也能直接用。 */
export type SurfaceNodeSource = {
  readonly type: string;
  readonly data: RuntimeV2JsonValue;
  readonly surface: SessionSurfaceOperationV1 | null;
};

const derivedNodes = new WeakMap<object, SessionSurfaceNodeV1 | null>();

/**
 * 事件进入模型对话的节点（agent-spec-surface-derived.md §4.2）。内容只存在 `data` 里，这里按事件类型推出，
 * 节点直接引用 `data` 里的值、不复制；同一个事件对象只推一次。
 * `surface` 为 `null`、事件类型不能进入对话、或缺少必需字段时返回 `null`（校验层负责拒绝后两种）。
 */
export function surfaceNode(event: SurfaceNodeSource): SessionSurfaceNodeV1 | null {
  if (event.surface === null || event.surface === undefined) return null;
  const cached = derivedNodes.get(event);
  if (cached !== undefined) return cached;
  // 推出的节点外壳冻结；字段引用 data，日志里的 data 已深度冻结，所以日志交出的对话整体只读
  //（agent-spec-context-trusted-surface.md §3.1）。
  const node = deriveSurfaceNode(event);
  if (node !== null) Object.freeze(node);
  derivedNodes.set(event, node);
  return node;
}

function deriveSurfaceNode(event: SurfaceNodeSource): SessionSurfaceNodeV1 | null {
  const data = event.data !== null && typeof event.data === "object" && !Array.isArray(event.data) ? event.data as Readonly<Record<string, RuntimeV2JsonValue>> : null;
  if (data === null) return null;
  const messageId = nonEmpty(data.messageId);
  switch (event.type) {
    case "user/message":
      return messageId && data.content !== undefined ? { kind: "user", messageId, content: data.content } : null;
    case "assistant/message":
      return messageId && data.content !== undefined ? { kind: "assistant", messageId, content: data.content } : null;
    case "agent/inbox/spliced":
      return data.operation === "claim" && messageId && data.content !== undefined ? { kind: "user", messageId, content: data.content } : null;
    case "tool/result": {
      const callId = nonEmpty(data.callId);
      return callId && data.modelOutput !== undefined ? { kind: "tool-result", messageId: `tool-${callId}`, callId, content: data.modelOutput, isError: data.status !== "completed" } : null;
    }
    case "tool/recovery-outcome": {
      const callId = nonEmpty(data.callId), repairId = nonEmpty(data.repairId);
      return callId && repairId && data.content !== undefined ? { kind: "tool-result", messageId: `recovery-${repairId}-${callId}`, callId, content: data.content, isError: true } : null;
    }
    case "surface/replaced":
      return isSurfaceNode(data.node) ? data.node : null;
    default:
      return null;
  }
}

/** 压缩摘要节点（`surface/replaced` 的 `data.node`）的形状检查，codec 校验也用它。 */
export function isSurfaceNode(value: RuntimeV2JsonValue | undefined): value is SessionSurfaceNodeV1 & RuntimeV2JsonValue {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) return false;
  const node = value as Readonly<Record<string, RuntimeV2JsonValue>>;
  if (!nonEmpty(node.messageId) || node.content === undefined) return false;
  if (node.kind === "user" || node.kind === "assistant") return true;
  return node.kind === "tool-result" && nonEmpty(node.callId) !== null && typeof node.isError === "boolean";
}

function nonEmpty(value: RuntimeV2JsonValue | undefined): string | null { return typeof value === "string" && value.length > 0 ? value : null; }

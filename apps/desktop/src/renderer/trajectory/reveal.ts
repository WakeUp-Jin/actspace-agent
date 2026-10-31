import type { TrajectoryRecord } from "./contract";

/**
 * 从别处（例如右侧 Context 面板、对话里的压缩分隔线）跳到轨迹里的某条记录。
 * 映射规则见 `front-右侧面板与文件渲染规范.md`「Context 面板 · 跳到轨迹」。
 */
export type TrajectoryRevealTarget =
  | { readonly callId: string }
  | { readonly messageId: string }
  | { readonly compactionId: string }
  | { readonly latest: "user" | "assistant" | "tool-call" | "tool-result" | null };

export function findRevealRecord(records: readonly TrajectoryRecord[], target: TrajectoryRevealTarget): TrajectoryRecord | null {
  const visible = records.filter((record) => record.visible !== false && !record.requestOnly);
  if ("callId" in target) return visible.find((record) => record.kind === "tool" && record.callId === target.callId) ?? null;
  if ("messageId" in target) return visible.find((record) => record.messageId === target.messageId) ?? null;
  if ("compactionId" in target) return visible.find((record) => record.kind === "compaction" && record.compaction?.compactionId === target.compactionId) ?? null;
  const kind = target.latest === "tool-call" || target.latest === "tool-result" ? "tool" : target.latest;
  for (let index = visible.length - 1; index >= 0; index -= 1) {
    const record = visible[index]!;
    if (kind === null || record.kind === kind) return record;
  }
  return null;
}

import type { TrajectoryCell, TrajectoryStatus } from "./contract";

/** DSH 的 5 条状态规则。 */
export function cellStatus(cell: TrajectoryCell): TrajectoryStatus {
  if (cell.isError) return "failed";
  if (cell.kind === "compacted" && cell.durationMs === null) return "running";
  if (cell.kind === "message" && (cell.record.partial || cell.record.assistantMetrics?.completedTime === null)) return "running";
  if ((cell.kind === "tool" || cell.kind === "subtool") && cell.record.outputDetail == null && cell.record.result === null) return "running";
  return "completed";
}

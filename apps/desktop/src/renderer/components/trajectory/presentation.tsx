import type { RuntimeV2JsonValue } from '@actspace/shared/runtime-v2';
import type { TrajectoryRecord } from '../../trajectory';

export function roleOf(record: TrajectoryRecord) {
  return ({ user: 'USER', assistant: 'ASSISTANT', tool: 'TOOL', approval: 'TOOL', system: 'SYSTEM', compaction: 'COMPACTED', error: 'ERROR' } as Record<string, string>)[record.kind] ?? 'EVENT';
}
export function RoleBadge({ record }: { record: TrajectoryRecord }) {
  const color = record.kind === 'assistant' ? 'bg-chart-series-3/15 text-chart-series-3'
    : record.kind === 'user' ? 'bg-info-soft text-info'
      : record.kind === 'tool' ? 'bg-warning-soft text-on-warning'
        : record.isError ? 'bg-danger-soft text-danger' : 'bg-surface-subtle text-text-muted';
  return <span className={`inline-flex w-fit shrink-0 rounded-act-xs px-1.5 py-0.5 text-act-xxs font-semibold tracking-wide ${color}`}>{roleOf(record)}</span>;
}
export function formatDuration(ms: number | null | undefined) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return 'Not available';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms).toLocaleString()} ms`;
}
export function formatTimestamp(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not available';
  const d = new Date(value);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
export function serialize(value: RuntimeV2JsonValue | undefined) {
  return typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2);
}

import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RuntimeV2JsonValue } from '@actspace/shared/runtime-v2';
import type { TrajectoryCell, TrajectoryLayout } from '../../../trajectory';
import { JsonTree } from '../../ui/JsonTree';

/** Everything a body needs to read the selected record and jump to related ones. */
export type RecordBodyProps = {
  readonly layout: TrajectoryLayout;
  readonly cell: TrajectoryCell;
  readonly onSelectRecord: (recordId: string) => void;
};

export type JsonValue = RuntimeV2JsonValue | null | undefined;

export function valueText(value: JsonValue): string | undefined {
  if (value === null || value === undefined) return undefined;
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

/** An object/array value, or a string that parses to one. */
export function parseContainer(value: JsonValue): object | undefined {
  if (value !== null && typeof value === 'object') return value;
  if (typeof value !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** The tool row that owns a call id (sub-tools included). */
export const findToolCell = (layout: TrajectoryLayout, callId: string | null | undefined) =>
  callId ? layout.cells.find(cell => (cell.kind === 'tool' || cell.kind === 'subtool') && cell.record.callId === callId) : undefined;

export const NoPayload = ({ children }: { children: ReactNode }) => <p className="tj-noPayload">{children}</p>;

export function MarkdownFragment({ text, preview = false, compact = false, className }: { text: string; preview?: boolean; compact?: boolean; className?: string }) {
  return (
    <div className={[preview ? 'tj-markdownPreview' : 'tj-markdownPayload', className].filter(Boolean).join(' ')}>
      <div data-markdown-variant={compact ? 'compact' : 'body'}><Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown></div>
    </div>
  );
}

export const RawFragment = ({ text, preview = false, className }: { text: string; preview?: boolean; className?: string }) => (
  <pre className={['tj-payload', preview ? 'tj-payloadPreview' : undefined, className].filter(Boolean).join(' ')}>{text}</pre>
);

export function JsonPayload({ data, label, preview = false, error = false }: { data: unknown; label: string; preview?: boolean; error?: boolean }) {
  const base = preview ? 'tj-jsonPreview' : 'tj-jsonPayload';
  return <JsonTree data={data} label={label} collapsedStringLines={preview ? 3 : 12} className={error ? `${base} errorPayload` : base} />;
}

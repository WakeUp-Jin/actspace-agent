import { ChevronRight, Wrench } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RuntimeV2JsonValue } from '@actspace/shared/runtime-v2';
import type { TrajectoryRecord, TrajectoryRuntimeSnapshot, TrajectorySourceBlock } from '../../trajectory';
import { serialize } from './presentation';

type ContentProps = {
  record: TrajectoryRecord;
  runtime: TrajectoryRuntimeSnapshot;
  onSelect: (record: TrajectoryRecord) => void;
  raw?: boolean;
};

/** Preview and Raw share the same block identities and navigation targets. */
export function TrajectoryContent({ record, runtime, onSelect, raw = false }: ContentProps) {
  const blocks = record.sourceBlocks?.length ? record.sourceBlocks : [{ type: 'text', content: record.preview }];
  const toolLink = (block: TrajectorySourceBlock, label?: string) => {
    const target = runtime.records.find(item => item.kind === 'tool' && item.callId != null && item.callId === block.callId);
    return <button type="button" aria-label={`Open tool call ${block.callId ?? 'unavailable'}`} disabled={!target}
      title={target ? 'Open tool call summary' : 'Tool call unavailable'}
      className="flex w-full min-w-0 items-center gap-1.5 text-left text-text-muted hover:text-text-main disabled:cursor-default disabled:text-text-faint focus-visible:outline-1 focus-visible:outline-focus-ring"
      onClick={() => { if (target) onSelect(target); }}>
      <Wrench size={12} className="shrink-0" />
      <span className="min-w-0 truncate font-mono text-act-xxs">{label ?? <>{block.toolName ?? target?.toolName ?? 'tool-call'} <span className="text-text-faint">{block.content}</span></>}</span>
      {!target && <span className="shrink-0 text-act-xxs">Unavailable</span>}
      {label && <ChevronRight size={12} className="shrink-0" />}
    </button>;
  };
  // Some old observations carry explicit ownership on the call, without a
  // provider content block. Show a reference in Preview without inventing Raw.
  const references = raw ? [] : runtime.records.filter(item => item.kind === 'tool' && !item.parentCallId && item.assistantRecordId === record.id && !blocks.some(block => block.callId === item.callId));
  return <div className="space-y-3 break-words leading-5 [&_p]:my-2 [&_pre]:overflow-auto [&_code]:font-mono [&_table]:w-full [&_td]:border [&_td]:border-line [&_td]:p-1 [&_th]:border [&_th]:border-line [&_th]:p-1">
    {blocks.map((block, index) => raw ? <section key={index}>
      <div className="mb-2 text-act-xxs text-text-faint">{block.callId ? toolLink(block, `Block #${index + 1} · ${block.type}`) : `Block #${index + 1} · ${block.type}`}</div>
      <pre className="m-0 whitespace-pre-wrap break-words font-mono text-act-xxs leading-5">{block.content}</pre>
    </section> : block.type === 'tool-call' ? <div key={index}>{toolLink(block)}</div>
      : block.type === 'thinking' || block.type === 'reasoning' ? <details key={index}><summary className="cursor-pointer text-text-muted">Thinking</summary><Markdown remarkPlugins={[remarkGfm]}>{block.content}</Markdown></details>
        : block.type === 'text' ? <Markdown key={index} remarkPlugins={[remarkGfm]}>{block.content}</Markdown>
          : <section key={index}><span className="text-text-faint">{block.type}</span><pre className="whitespace-pre-wrap break-words text-act-xxs">{block.content}</pre></section>)}
    {references.map(call => <div key={call.id}>{toolLink({ type: 'tool-call', callId: call.callId!, toolName: call.toolName ?? undefined, content: serialize(call.toolArguments) })}</div>)}
  </div>;
}

export function ToolSchema({ value, preview = false }: { value: RuntimeV2JsonValue | undefined; preview?: boolean }) {
  if (value == null) return <p className="m-0 text-text-faint">Schema unavailable</p>;
  const schema = typeof value === 'object' && !Array.isArray(value) ? value as Readonly<Record<string, RuntimeV2JsonValue>> : null;
  return <div className={preview ? 'max-h-48 overflow-hidden' : ''}>
    {schema && typeof schema.name === 'string' && <h3 className="m-0 text-act-sm font-medium">{schema.name}</h3>}
    {schema && typeof schema.description === 'string' && <p className="my-2 whitespace-pre-wrap leading-5">{schema.description}</p>}
    {(schema?.parameters ?? schema?.inputSchema) != null && <h4 className="mb-2 mt-4 font-medium text-text-muted">Parameters</h4>}
    <pre className="m-0 whitespace-pre-wrap break-words font-mono text-act-xxs leading-5">{serialize(schema?.parameters ?? schema?.inputSchema ?? value)}</pre>
  </div>;
}

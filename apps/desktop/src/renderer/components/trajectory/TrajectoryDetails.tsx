import { ChevronRight, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import type { RuntimeV2JsonValue } from '@actspace/shared/runtime-v2';
import type { TrajectoryRecord, TrajectoryRuntimeSnapshot } from '../../trajectory';
import { TrajectoryContent, ToolSchema } from './TrajectoryContent';
import { formatDuration, formatTimestamp, RoleBadge, serialize } from './presentation';

function Fields({ items }: { items: [string, ReactNode][] }) {
  return <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">{items.map(([label, value]) => <div key={label} className="contents"><dt className="text-text-faint">{label}</dt><dd className="m-0 min-w-0 break-words tabular-nums text-text-main">{value}</dd></div>)}</dl>;
}
function Payload({ value, missing = 'Not recorded', preview = false }: { value: RuntimeV2JsonValue | undefined; missing?: string; preview?: boolean }) {
  if (value == null) return <p className="m-0 text-text-faint">{missing}</p>;
  return <pre className={`m-0 whitespace-pre-wrap break-words font-mono text-[11px] leading-5 ${preview ? 'max-h-28 overflow-hidden' : ''}`}>{serialize(value)}</pre>;
}
function Section({ title, onOpen, children }: { title: string; onOpen?: () => void; children: ReactNode }) {
  return <section className="mt-6"><button type="button" className="mb-2 inline-flex items-center gap-1 text-text-muted hover:text-text-main" onClick={onOpen}>{title}<ChevronRight size={12} /></button>{children}</section>;
}
/** A bounded line diff: retain common edges and show the changed middle. */
function PromptDiff({ record }: { record: TrajectoryRecord }) {
  const promptValue = (value: TrajectoryRecord['promptDetail']) => [serialize(value?.systemPrompt ?? value?.systemPromptParts), 'Tools', serialize(value?.tools), 'Config', serialize(value?.config)].join('\n');
  const before = serialize(promptValue(record.previousPromptDetail) as RuntimeV2JsonValue).split('\n');
  const after = serialize(promptValue(record.promptDetail) as RuntimeV2JsonValue).split('\n');
  let prefix = 0; let suffix = 0;
  while (prefix < Math.min(before.length, after.length) && before[prefix] === after[prefix]) prefix++;
  while (suffix < Math.min(before.length, after.length) - prefix && before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix++;
  const lines = [
    ...before.slice(0, prefix).map(line => ({ sign: ' ', line })),
    ...before.slice(prefix, before.length - suffix).map(line => ({ sign: '-', line })),
    ...after.slice(prefix, after.length - suffix).map(line => ({ sign: '+', line })),
    ...after.slice(after.length - suffix).map(line => ({ sign: ' ', line })),
  ];
  return <pre aria-label="Prompt changes" className="m-0 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5">{lines.map(({ sign, line }, index) => <div key={index} className={sign === '+' ? 'bg-success-soft text-success' : sign === '-' ? 'bg-danger-soft text-danger' : 'text-text-muted'}>{sign} {line}</div>)}</pre>;
}
function Timing({ record }: { record: TrajectoryRecord }) {
  const metrics = record.assistantMetrics;
  return <Fields items={metrics ? [
    ['Started', formatTimestamp(metrics.stepStartAt)],
    ['Total duration', formatDuration(record.durationMs)],
    ['TTFT', formatDuration(metrics.ttftMs)],
    ['Generation', formatDuration(metrics.generationMs)],
    ['Throughput', metrics.throughputTokensPerSecond == null ? 'Not available' : `${metrics.throughputTokensPerSecond.toFixed(1)} tok/s`],
  ] : [
    ['Started', formatTimestamp(record.startedAt)], ['Duration', formatDuration(record.durationMs)],
    ['Timing source', record.durationMs == null ? 'Not available' : record.timingSource ?? 'Session timestamps'],
  ]} />;
}
export function TrajectoryDetails({ runtime, record, onClose, onSelect, initialRequest = false }: { initialRequest?: boolean; runtime: TrajectoryRuntimeSnapshot; record: TrajectoryRecord; onClose: () => void; onSelect: (record: TrajectoryRecord) => void }) {
  const [tab, setTab] = useState('Summary');
  const [requestOpen, setRequestOpen] = useState(initialRequest);
  const [width, setWidth] = useState<number | null>(null);
  const panel = useRef<HTMLElement>(null);
  const resize = useRef<{ x: number; width: number } | null>(null);
  const user = record.kind === 'user'; const tool = record.kind === 'tool'; const system = record.kind === 'system';
  const tabs = requestOpen ? ['Summary', 'Options', 'Usage', 'Timing'] : system
    ? [...(record.previousPromptDetail ? ['Diff'] : []), 'System Prompt', 'Tools']
    : tool ? ['Summary', ...(record.toolArguments != null ? ['Payload'] : []), ...(record.outputDetail != null ? ['Result'] : []), 'Schema', 'Timing']
      : ['Summary', 'Preview', 'Raw', ...(user && record.messageSource ? ['Source'] : [])];
  const active = tabs.includes(tab) ? tab : tabs[0]!;
  const parent = tool ? runtime.records.find(item => item.callId != null && item.callId === record.parentCallId) ?? runtime.records.find(item => item.id === record.assistantRecordId) : null;
  const requestIds = [...new Set(runtime.nodes.flatMap(node => {
    const data = (node.data !== null && typeof node.data === "object" && !Array.isArray(node.data) ? node.data : {}) as Record<string, RuntimeV2JsonValue>;
    return node.eventType === 'request/header' && typeof data.requestId === 'string' ? [data.requestId] : [];
  }))];
  const requestNumber = record.requestId ? requestIds.indexOf(record.requestId) + 1 + (runtime.requestOffset ?? 0) : null;
  const open = (next: string) => setTab(next);
  const status = record.state === 'observed' ? 'Completed' : record.state.charAt(0).toUpperCase() + record.state.slice(1);
  const usage = record.usage;
  const tokens = usage?.outputTokens;
  const sourceLink = <button type="button" className="inline-flex items-center gap-1 text-text-muted hover:text-text-main" onClick={() => { setRequestOpen(true); setTab('Summary'); }}>Request #{requestNumber || '—'}<ChevronRight size={12} /></button>;
  const summaryFields: [string, ReactNode][] = [
    ...(parent ? [['Hierarchy', <button type="button" className="inline-flex items-center gap-1 text-text-muted hover:text-text-main" onClick={() => onSelect(parent)}>{parent.kind === 'tool' ? 'Parent Tool' : 'Assistant Message'}<ChevronRight size={12} /></button>] as [string, ReactNode]] : []),
    ...(user && record.messageSource ? [['Source', <button type="button" className="text-text-muted hover:text-text-main" onClick={() => open('Source')}>User</button>] as [string, ReactNode]] : []),
    ...(!tool && !user && record.requestDetail ? [['Source', sourceLink] as [string, ReactNode]] : []),
    ['Status', status],
    ...(record.kind === 'user' ? [['Duration', formatDuration(record.durationMs)] as [string, ReactNode]] : []),
    ...(record.kind === 'assistant' ? [
      ['Tokens', tokens == null ? 'Not reported' : `${tokens.toLocaleString()} tok`],
      ['Reasoning', usage?.reasoningTokens == null ? 'Not reported' : `${usage.reasoningTokens.toLocaleString()} tok`],
      ['Content', tokens == null || usage?.reasoningTokens == null ? 'Not reported' : `${Math.max(0, tokens - usage.reasoningTokens).toLocaleString()} tok`],
    ] as [string, ReactNode][] : []),
  ];
  const req = record.requestDetail;
  return <aside ref={panel} style={width === null ? undefined : { width }} aria-label="Event details" className="relative flex min-h-0 w-[42%] min-w-[300px] max-w-[640px] flex-col border-l border-line bg-surface max-[760px]:absolute max-[760px]:bottom-0 max-[760px]:h-[70%] max-[760px]:border-t max-[760px]:right-0 max-[760px]:z-20 max-[760px]:!w-full max-[760px]:min-w-0 max-[760px]:max-w-none">
    <div role="separator" aria-label="Resize event details" aria-orientation="vertical" tabIndex={0} className="absolute -left-1 inset-y-0 z-30 w-2 cursor-col-resize touch-none max-[760px]:hidden"
      onPointerDown={event => { resize.current = { x: event.clientX, width: panel.current?.getBoundingClientRect().width ?? 400 }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (resize.current) setWidth(Math.min(640, Math.max(300, resize.current.width + resize.current.x - event.clientX))); }}
      onPointerUp={event => { resize.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { resize.current = null; }}
      onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setWidth(current => Math.min(640, Math.max(300, (current ?? panel.current?.getBoundingClientRect().width ?? 400) + (event.key === 'ArrowLeft' ? 24 : -24)))); } }} />
    <div className="flex min-h-12 items-center gap-2 border-b border-line px-3">
      {requestOpen ? <button className="text-text-muted hover:text-text-main" onClick={() => { setRequestOpen(false); setTab('Summary'); }}>Request #{requestNumber}</button> : <RoleBadge record={record} />}
      <span className="min-w-0 font-mono text-[11px] text-text-faint">{record.turnNumber != null ? `Turn ${record.turnNumber}` : ''}{user ? ' · Message' : record.stepNumber != null ? ` · Step ${record.stepNumber}` : ''}</span>
      <button aria-label="Close event details" className="ml-auto p-1 text-text-muted hover:text-text-main" onClick={onClose}><X size={15} /></button>
    </div>
    <div role="tablist" aria-label="Event details" className="flex shrink-0 overflow-x-auto border-b border-line px-2">{tabs.map(label => <button key={label} type="button" role="tab" aria-selected={label === active} className={`shrink-0 border-b-2 px-2 py-2.5 text-[12px] ${label === active ? 'border-info text-info' : 'border-transparent text-text-muted hover:text-text-main'}`} onClick={() => open(label)}>{label}</button>)}</div>
    <div role="tabpanel" className="min-h-0 flex-1 overflow-auto p-4 text-[12px] text-text-main">
      {requestOpen ? <>
        {active === 'Summary' && <><Fields items={ [['Status', status], ['Request', req?.requestId ?? 'Not recorded'], ['Provider', req?.provider ?? 'Not recorded'], ['Model', req?.model ?? 'Not recorded']] } /><Section title="Options" onOpen={() => open('Options')}><Payload value={record.requestOptions} preview /></Section><Section title="Usage" onOpen={() => open('Usage')}><Payload value={usage as RuntimeV2JsonValue} preview /></Section><Section title="Timing" onOpen={() => open('Timing')}><Timing record={record} /></Section></>}
        {active === 'Options' && <Payload value={record.requestOptions} />}{active === 'Usage' && <Payload value={usage as RuntimeV2JsonValue} missing="Usage not reported" />}{active === 'Timing' && <Timing record={record} />}
      </> : <>
        {active === 'Summary' && <><Fields items={summaryFields} />
          {tool ? <>
            {record.toolArguments != null && <Section title="Payload" onOpen={() => open('Payload')}><Payload value={record.toolArguments} preview /></Section>}
            {record.outputDetail != null && <Section title="Result" onOpen={() => open('Result')}><Payload value={record.outputDetail} preview /></Section>}
            <Section title="Schema" onOpen={() => open('Schema')}><ToolSchema value={record.schemaDetail} preview /></Section>
            <Section title="Timing" onOpen={() => open('Timing')}><Timing record={record} /></Section>
          </> : <>
            <Section title="Preview" onOpen={() => open('Preview')}><TrajectoryContent record={record} runtime={runtime} onSelect={onSelect} /></Section>
            {record.kind === 'assistant' && <Section title="Request Timing" onOpen={() => { if (req) { setRequestOpen(true); open('Timing'); } }}><Timing record={record} /></Section>}
          </>}
          <details className="mt-6 text-text-faint"><summary className="cursor-pointer">Source events · {record.sourceSequences.join(', ')}</summary><Payload value={runtime.nodes.filter(node => record.sourceSequences.includes(node.eventSeq) || record.requestDetail?.sourceSequences.includes(node.eventSeq)) as unknown as RuntimeV2JsonValue} /></details>
        </>}
        {active === 'Preview' && <TrajectoryContent record={record} runtime={runtime} onSelect={onSelect} />}
        {active === 'Raw' && <TrajectoryContent record={record} runtime={runtime} onSelect={onSelect} raw />}
        {active === 'Source' && <Payload value={record.messageSource} />}
        {active === 'Payload' && <Payload value={record.toolArguments} />}
        {active === 'Result' && <Payload value={record.outputDetail} missing="No result" />}
        {active === 'Schema' && <ToolSchema value={record.schemaDetail} />}
        {active === 'Timing' && <Timing record={record} />}
        {active === 'System Prompt' && <Payload value={record.promptDetail?.systemPrompt ?? record.promptDetail?.systemPromptParts} />}
        {active === 'Tools' && <Payload value={record.promptDetail?.tools} missing="No tools in this request" />}
        {active === 'Diff' && <PromptDiff record={record} />}
      </>}
    </div>
  </aside>;
}

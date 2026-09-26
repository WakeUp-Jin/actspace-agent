import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { TrajectoryRecord, TrajectoryRuntimeSnapshot, TrajectoryTimeRange } from '../../trajectory';
import { formatDuration, formatTimestamp, roleOf } from './presentation';

type Range = TrajectoryTimeRange;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const ordered = (a: number, b: number): Range => ({ start: Math.min(a, b), end: Math.max(a, b) });
type Gesture = { pointer: number; x: number; anchor: number; recordId: string | null; pan: boolean; moved: boolean };

export function TrajectoryTimeline({ runtime, selectedId, matches, range, onRange, onSelect, onFocus }: {
  runtime: TrajectoryRuntimeSnapshot; selectedId: string | null; matches: ReadonlySet<string> | null;
  range: Range | null; onRange: (range: Range | null) => void;
  onSelect: (record: TrajectoryRecord) => void; onFocus: (record: TrajectoryRecord) => void;
}) {
  const model = runtime.timeline;
  const track = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [draft, setDraft] = useState<Range | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [viewport, setViewport] = useState<Range | null>(null);
  const [animate, setAnimate] = useState(false);
  const records = useMemo(() => new Map(runtime.records.map(record => [record.id, record])), [runtime.records]);
  const full = Math.max(1, (model?.end ?? 1) - (model?.start ?? 0));
  const duration = Math.min(full, Math.max(1, viewport ? viewport.end - viewport.start : full));
  const start = clamp(viewport?.start ?? model?.start ?? 0, model?.start ?? 0, (model?.start ?? 0) + full - duration);
  const activeRange = draft ?? range;
  useEffect(() => { setViewport(null); setDraft(null); gesture.current = null; }, [model?.mode, runtime.sessionId]);
  useEffect(() => {
    if (!model || !selectedId) return;
    const span = model.spans.find(item => item.recordId === selectedId);
    if (!span) return;
    setViewport(current => {
      if (!current || (span.end >= current.start && span.start <= current.end)) return current;
      const width = current.end - current.start;
      const left = clamp(span.start, model.start, Math.max(model.start, model.end - width));
      setAnimate(true);
      return { start: left, end: left + width };
    });
  }, [model, selectedId]);
  useEffect(() => {
    const element = track.current;
    if (!element || !model) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const fraction = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      const width = clamp(duration * Math.exp(event.deltaY * 0.0015), Math.min(model.mode === 'sequence' ? 4 : 20, full), full);
      const left = clamp(start + fraction * duration - fraction * width, model.start, model.start + full - width);
      setAnimate(false);
      setViewport(width >= full * 0.999 ? null : { start: left, end: left + width });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [duration, full, model, start]);
  if (!model) return <section aria-label="Trajectory timeline" className="shrink-0 border-b border-line px-3 py-3 text-act-xxs text-text-faint">No timing data</section>;
  const fractionAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
  };
  const cancel = () => { gesture.current = null; setDraft(null); setHover(null); };
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 2) return;
    const fraction = fractionAt(event);
    const recordId = (event.target as HTMLElement).closest<HTMLElement>('[data-timeline-record]')?.dataset.timelineRecord ?? null;
    gesture.current = { pointer: event.pointerId, x: event.clientX, anchor: event.button === 2 ? start : start + fraction * duration, recordId, pan: event.button === 2, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setAnimate(false);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const fraction = fractionAt(event); setHover(fraction);
    const drag = gesture.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    drag.moved ||= Math.abs(event.clientX - drag.x) >= 3;
    const rect = event.currentTarget.getBoundingClientRect();
    if (drag.pan) {
      const left = clamp(drag.anchor - (event.clientX - drag.x) / Math.max(1, rect.width) * duration, model.start, model.start + full - duration);
      if (viewport) setViewport({ start: left, end: left + duration });
      return;
    }
    if (!drag.moved) return;
    let left = start;
    if (viewport && (fraction < 0.08 || fraction > 0.92)) {
      left = clamp(start + (fraction < 0.08 ? -1 : 1) * duration * 0.025, model.start, model.start + full - duration);
      setViewport({ start: left, end: left + duration });
    }
    setDraft(ordered(drag.anchor, left + fraction * duration));
  };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    const drag = gesture.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    const moved = drag.moved || Math.abs(event.clientX - drag.x) >= 3;
    gesture.current = null; setDraft(null);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.pan) { if (!moved) onRange(null); return; }
    const clicked = drag.recordId ? records.get(drag.recordId) : undefined;
    if (!moved && clicked) { onRange(null); onSelect(clicked); return; }
    const point = start + fractionAt(event) * duration;
    const selected = ordered(drag.anchor, point);
    const minimum = Math.min(duration, full / Math.max(1, model.spans.length));
    if (selected.end - selected.start < minimum) {
      const center = (selected.start + selected.end) / 2;
      const left = clamp(center - minimum / 2, model.start, model.start + full - minimum);
      onRange({ start: left, end: left + minimum });
    } else onRange(selected);
    const near = model.spans.find(span => span.end >= selected.start && span.start <= selected.end)
      ?? [...model.spans].sort((a, b) => Math.abs(a.start - point) - Math.abs(b.start - point))[0];
    if (near && records.has(near.recordId)) onFocus(records.get(near.recordId)!);
  };
  const selectionStart = activeRange ? clamp((activeRange.start - start) / duration, 0, 1) : 0;
  const selectionEnd = activeRange ? clamp((activeRange.end - start) / duration, 0, 1) : 0;
  return <section aria-label="Trajectory timeline" className="shrink-0 border-b border-line bg-surface">
    <div className="grid h-[54px] grid-cols-[52px_minmax(0,1fr)]">
      <div className="grid grid-rows-3 py-1 pr-1 text-right text-act-xxs leading-[15px] text-text-faint"><span>Input</span><span>Model</span><span>Tools</span></div>
      <div ref={track} data-testid="trajectory-overview-track" aria-label="Timeline overview; drag horizontally to focus events" tabIndex={0}
        className="relative touch-none select-none overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus-ring"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
        onPointerLeave={() => { if (!gesture.current) setHover(null); }} onContextMenu={event => event.preventDefault()}
        onDoubleClick={() => onRange(null)} onKeyDown={event => { if (event.key === 'Escape') { cancel(); onRange(null); } }}>
        {activeRange && <div data-testid="trajectory-selection" className="pointer-events-none absolute inset-y-0 z-10 border-x-2 border-info bg-info/10" style={{ left: `${selectionStart * 100}%`, width: `${(selectionEnd - selectionStart) * 100}%` }} />}
        {hover !== null && !draft && <div className="pointer-events-none absolute inset-y-0 w-px bg-line-strong" style={{ left: `${hover * 100}%` }} />}
        {model.turnBoundaries.filter(boundary => boundary.time > model.start).map(boundary => <div key={boundary.turnNumber} className="pointer-events-none absolute inset-y-0 w-px bg-line" style={{ left: `${(boundary.time - start) / duration * 100}%` }} />)}
        {model.spans.map(span => {
          const record = records.get(span.recordId)!;
          if (span.end < start || span.start > start + duration) return null;
          const dim = (matches && !matches.has(record.id)) || (activeRange && (span.end < activeRange.start || span.start > activeRange.end));
          const color = record.isError ? 'bg-danger' : span.lane === 2 ? 'bg-warning' : span.lane === 1 ? 'bg-chart-series-3' : 'bg-info';
          const metrics = record.assistantMetrics;
          const ttft = metrics?.ttftMs; const generation = metrics?.generationMs;
          return <button key={record.id} type="button" data-timeline-record={record.id} aria-label={`${roleOf(record)} ${record.eventType}, event ${(record.sourceSequences[0] ?? 0) + 1}`} aria-pressed={selectedId === record.id}
            title={`${roleOf(record)}\nStarted ${formatTimestamp(record.startedAt)}\nDuration ${formatDuration(record.durationMs)}`}
            className={`absolute h-[9px] min-w-[3px] overflow-hidden rounded-[1px] ${color} ${dim ? 'opacity-20' : 'opacity-80 hover:opacity-100'} ${selectedId === record.id ? 'ring-1 ring-info ring-offset-1 ring-offset-surface' : ''} ${animate ? 'transition-[left,width] duration-(--motion-base) motion-reduce:transition-none' : ''}`}
            style={{ left: `${(span.start - start) / duration * 100}%`, top: 6 + span.lane * 15, width: `max(3px, calc(${(span.end - span.start) / duration * 100}% - 1px))` }}
            onClick={event => { if (event.detail === 0) { onRange(null); onSelect(record); } }}>
            {ttft != null && generation != null && ttft + generation > 0 && <span className="absolute inset-y-0 left-0 bg-surface/50" style={{ width: `${ttft / (ttft + generation) * 100}%` }} />}
          </button>;
        })}
      </div>
    </div>
  </section>;
}

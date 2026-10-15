import { memo, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import {
  formatClock, formatDurationMs, KIND_LABEL, T, timelineTotal, timelineTtftDecoding,
  type TrajectoryTimeline as TimelineModel, type TrajectoryTimelineMode, type TrajectoryTimelineSpan, type TrajectoryTimeRange,
} from "../../trajectory";
import { clampFraction, useTimelineViewport } from "./use-timeline-viewport";

const MINIMUM_DRAG_PX = 3;
const EDGE_PAN_ZONE_FRACTION = 0.08;
const EDGE_PAN_STEP_FRACTION = 0.025;
const MAXIMUM_EDGE_PAN_PX = 32;
const TOOLTIP_DELAY_MS = 500;

/** Lane labels and a few strings the shared table does not carry (DSH zh locale). */
const LANE_LABELS = ["输入", "模型", "工具"] as const;
const CLICK_TO_LOAD_EARLIER = "点击加载更早的历史";
const startedAtLabel = (time: string) => `开始于 ${time}`;

export type TrajectoryTimelineProps = {
  /** Computed by the parent from the structure signature, so streaming text does not rebuild it. */
  model: TimelineModel | null;
  mode: TrajectoryTimelineMode;
  selectedId: string | null;
  /** Record ids matching the active search, or null without a query. */
  matches: ReadonlySet<string> | null;
  range: TrajectoryTimeRange | null;
  onRange(range: TrajectoryTimeRange | null): void;
  onSelect(recordId: string): void;
  hasEarlier: boolean;
  loadingEarlier: boolean;
  onLoadEarlier(): void;
};

type Hover = { fraction: number; recordId: string | null };
type Drag = { pointerId: number; anchorTime: number; anchorClientX: number; recordId: string | null };
type Pan = { pointerId: number; anchorClientX: number; anchorStart: number; moved: boolean; pannable: boolean };
type Tip = { recordId: string; x: number };

const ordered = (a: number, b: number): TrajectoryTimeRange => a <= b ? { start: a, end: b } : { start: b, end: a };

function centered(center: number, width: number, minimum: number, maximum: number): TrajectoryTimeRange {
  const clamped = Math.min(maximum - minimum, Math.max(0, width));
  const start = Math.min(Math.max(center - clamped / 2, minimum), maximum - clamped);
  return { start, end: start + clamped };
}

function fractionRange(range: TrajectoryTimeRange, start: number, duration: number, model: TimelineModel): TrajectoryTimeRange {
  const bound = (value: number) => Math.min(model.end, Math.max(model.start, value));
  const next = ordered(bound(range.start), bound(range.end));
  return { start: (next.start - start) / duration, end: (next.end - start) / duration };
}

/** Tooltip text: kind, `start → end`, then total and first-token/decoding split. */
export function timelineTooltipLabel(span: TrajectoryTimelineSpan): string {
  const range = span.startedAt === null ? null
    : span.durationMs === null ? startedAtLabel(formatClock(span.startedAt))
      : `${formatClock(span.startedAt)} → ${formatClock(span.startedAt + span.durationMs)}`;
  const total = span.durationMs === null ? null : timelineTotal(formatDurationMs(span.durationMs));
  const split = span.ttftMs === null || span.decodingMs === null ? null : timelineTtftDecoding(formatDurationMs(span.ttftMs), formatDurationMs(span.decodingMs));
  const timing = [total, split].filter(Boolean).join(" · ");
  return [KIND_LABEL[span.kind], range, timing].filter(Boolean).join("\n");
}

function EarlierHistory({ loading, onLoad, onHover }: { loading: boolean; onLoad(): void; onHover(): void }) {
  return <button type="button" className="tjl-earlierHistory" data-earlier-history data-loading={loading || undefined}
    title={loading ? T.loadingEarlier : CLICK_TO_LOAD_EARLIER} aria-label={loading ? T.loadingEarlier : T.loadEarlier} aria-disabled={loading}
    onClick={() => { if (!loading) onLoad(); }}
    onPointerEnter={event => { event.stopPropagation(); onHover(); }}
    onPointerMove={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>…</button>;
}

const Labels = () => <div className="tjl-labels" aria-hidden="true">{LANE_LABELS.map(label => <span key={label}>{label}</span>)}</div>;

/** DSH-style overview timeline: drag a range, click a block, wheel zoom, right-drag pan, Esc to clear. */
export const TrajectoryTimeline = memo(function TrajectoryTimeline({
  model, mode, selectedId, matches, range, onRange, onSelect, hasEarlier, loadingEarlier, onLoadEarlier,
}: TrajectoryTimelineProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const panRef = useRef<Pan | null>(null);
  const [draft, setDraft] = useState<TrajectoryTimeRange | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [panning, setPanning] = useState(false);
  const [tip, setTip] = useState<Tip | null>(null);
  const { viewport, setViewport, animate, setAnimate, fullDuration, domainStart, domainDuration } = useTimelineViewport(model, mode, selectedId, rootRef, trackRef);
  const hoveredId = hover?.recordId ?? null;
  const pointerX = useRef(0);

  useEffect(() => {
    if (model !== null && range !== null && (range.end < model.start || range.start > model.end)) onRange(null);
  }, [model, onRange, range]);

  useEffect(() => {
    setTip(null);
    if (hoveredId === null || draft !== null) return;
    const timer = window.setTimeout(() => setTip({ recordId: hoveredId, x: pointerX.current }), TOOLTIP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [hoveredId, draft !== null]);

  const showsEarlier = hasEarlier && (model === null || domainStart === model.start);
  const earlier = showsEarlier && <EarlierHistory loading={loadingEarlier} onLoad={onLoadEarlier} onHover={() => setHover(null)} />;

  if (model === null) {
    return <section ref={rootRef} className="tjl-root" aria-label={T.timelineAria}>
      <div className="tjl-plot"><Labels /><div ref={trackRef} className="tjl-track"><span className="tjl-empty">{T.noTimingData}</span>{earlier}</div></div>
    </section>;
  }

  const activeRange = draft ?? range;
  const visible = activeRange === null ? null : fractionRange(activeRange, domainStart, domainDuration, model);
  const domainStyle = {
    "--trajectory-domain-left": `${-(domainStart - model.start) / domainDuration * 100}%`,
    "--trajectory-domain-width": `${fullDuration / domainDuration * 100}%`,
  } as CSSProperties;
  const selectionStyle = visible === null ? undefined : {
    "--trajectory-selection-left": `${visible.start * 100}%`,
    "--trajectory-selection-width": `${(visible.end - visible.start) * 100}%`,
  } as CSSProperties;
  const minimumSelection = Math.min(domainDuration, fullDuration / model.spans.length);

  const fractionAt = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return clampFraction((event.clientX - rect.left) / Math.max(1, rect.width));
  };
  const recordAt = (event: PointerEvent<HTMLElement>): string | null =>
    (event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-record-id]")?.dataset.recordId : undefined) ?? null;
  const capture = (event: PointerEvent<HTMLElement>) => {
    if (typeof event.currentTarget.setPointerCapture === "function") event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button === 2) {
      panRef.current = { pointerId: event.pointerId, anchorClientX: event.clientX, anchorStart: domainStart, moved: false, pannable: viewport !== null };
      if (viewport !== null) setAnimate(false);
      setPanning(true);
      capture(event);
      return;
    }
    if (event.button !== 0) return;
    const fraction = fractionAt(event);
    const anchorTime = domainStart + fraction * domainDuration;
    const recordId = recordAt(event);
    pointerX.current = event.clientX;
    setHover({ fraction, recordId });
    dragRef.current = { pointerId: event.pointerId, anchorTime, anchorClientX: event.clientX, recordId };
    capture(event);
    setDraft({ start: anchorTime, end: anchorTime });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = fractionAt(event);
    pointerX.current = event.clientX;
    setHover({ fraction, recordId: recordAt(event) });
    const pan = panRef.current;
    if (pan !== null && pan.pointerId === event.pointerId) {
      if (Math.abs(event.clientX - pan.anchorClientX) >= MINIMUM_DRAG_PX) pan.moved = true;
      if (!pan.pannable) return;
      const delta = (event.clientX - pan.anchorClientX) / Math.max(1, rect.width);
      const start = Math.min(Math.max(pan.anchorStart - delta * domainDuration, model.start), model.end - domainDuration);
      setViewport({ start, end: start + domainDuration });
      return;
    }
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    let nextStart = domainStart;
    if (viewport !== null) {
      const localX = event.clientX - rect.left;
      const edge = Math.min(MAXIMUM_EDGE_PAN_PX, Math.max(1, rect.width * EDGE_PAN_ZONE_FRACTION));
      const direction = localX < edge ? -1 : localX > rect.width - edge ? 1 : 0;
      if (direction !== 0) {
        const distance = direction < 0 ? edge - localX : localX - (rect.width - edge);
        const strength = clampFraction(distance / edge);
        const desired = domainStart + direction * domainDuration * EDGE_PAN_STEP_FRACTION * Math.max(0.2, strength);
        nextStart = Math.min(Math.max(desired, model.start), model.end - domainDuration);
        if (nextStart !== domainStart) {
          setAnimate(false);
          setViewport({ start: nextStart, end: nextStart + domainDuration });
        }
      }
    }
    setDraft(ordered(drag.anchorTime, nextStart + fraction * domainDuration));
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (pan !== null && pan.pointerId === event.pointerId) {
      const moved = pan.moved || Math.abs(event.clientX - pan.anchorClientX) >= MINIMUM_DRAG_PX;
      panRef.current = null;
      setPanning(false);
      if (!moved) onRange(null);
      return;
    }
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    const fraction = fractionAt(event);
    const selected = ordered(drag.anchorTime, domainStart + fraction * domainDuration);
    setHover({ fraction, recordId: recordAt(event) });
    dragRef.current = null;
    setDraft(null);
    const click = Math.abs(event.clientX - drag.anchorClientX) < MINIMUM_DRAG_PX;
    if (click && drag.recordId !== null && model.spans.some(span => span.recordId === drag.recordId)) {
      onRange(null);
      onSelect(drag.recordId);
      return;
    }
    // A click on blank space or a tiny drag becomes a minimum-width range; a click also selects the nearest row.
    onRange(selected.end - selected.start < minimumSelection
      ? centered(click ? selected.start : (selected.start + selected.end) / 2, minimumSelection, model.start, model.end)
      : selected);
    if (click) {
      const distance = (span: TrajectoryTimelineSpan) => selected.start < span.start ? span.start - selected.start : selected.start > span.end ? selected.start - span.end : 0;
      const nearest = model.spans.reduce((best, span) => distance(span) < distance(best) ? span : best);
      onSelect(nearest.recordId);
    }
  };

  const onPointerCancel = () => {
    dragRef.current = null;
    panRef.current = null;
    setDraft(null);
    setHover(null);
    setPanning(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || (range === null && draft === null)) return;
    event.preventDefault();
    dragRef.current = null;
    setDraft(null);
    onRange(null);
  };

  const tipSpan = tip === null ? undefined : model.spans.find(span => span.recordId === tip.recordId);
  const animateAttr = animate || undefined;
  const dragging = draft === null ? undefined : "true";

  return <section ref={rootRef} className="tjl-root" aria-label={T.timelineAria}>
    <div className="tjl-plot">
      <Labels />
      <div ref={trackRef} className="tjl-track" data-panning={panning || undefined} aria-label={T.timelineOverviewAria} tabIndex={0}
        onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerCancel}
        onPointerLeave={() => { if (dragRef.current === null && panRef.current === null) setHover(null); }}
        onDoubleClick={event => { event.preventDefault(); onRange(null); }} onContextMenu={event => event.preventDefault()}>
        {earlier}
        {hover !== null && hover.recordId === null && draft === null &&
          <div className="tjl-hoverLine" data-timeline-hover-line aria-hidden="true" style={{ "--trajectory-hover-left": `${hover.fraction * 100}%` } as CSSProperties} />}
        {visible !== null && <>
          <div className="tjl-selection" data-dragging={dragging} aria-hidden="true" style={selectionStyle} />
          <div className="tjl-selectionEdges" data-dragging={dragging} aria-hidden="true" style={selectionStyle} />
        </>}
        <div className="tjl-turnBoundaries" data-animate-viewport={animateAttr} aria-hidden="true" style={domainStyle}>
          {model.turnBoundaries.filter(boundary => boundary.time > model.start && boundary.time >= domainStart && boundary.time <= domainStart + domainDuration).map(boundary =>
            <span key={boundary.turn} className="tjl-turnBoundary" data-turn={boundary.turn} style={{ "--trajectory-turn-left": `${(boundary.time - model.start) / fullDuration * 100}%` } as CSSProperties} />)}
        </div>
        <div className="tjl-lanes" data-animate-viewport={animateAttr} data-timeline-domain style={domainStyle}>
          {model.spans.filter(span => span.recordId === selectedId || (span.end >= domainStart && span.start <= domainStart + domainDuration)).map(span => {
            const widthPercent = (span.end - span.start) / fullDuration * 100;
            const hasSplit = span.ttftMs !== null && span.decodingMs !== null && span.ttftMs + span.decodingMs > 0;
            return <span key={span.recordId} aria-hidden="true" className="tjl-span" data-record-id={span.recordId} data-timeline-span={span.kind} data-kind={span.kind} data-lane={span.lane}
              data-assistant-timing={hasSplit || undefined} data-error={span.isError || undefined} data-equal-duration={mode === "time" || undefined}
              data-current={span.recordId === selectedId || undefined} data-hovered={hoveredId === span.recordId || undefined}
              data-search-match={matches === null ? undefined : matches.has(span.recordId) ? "true" : "false"}
              data-selected={activeRange === null ? undefined : span.start <= activeRange.end && span.end >= activeRange.start ? "true" : "false"}
              style={{
                "--trajectory-span-left": `${(span.start - model.start) / fullDuration * 100}%`,
                "--trajectory-span-width": `${widthPercent}%`,
                "--trajectory-span-gap": `min(${widthPercent * 0.08}%, 1px)`,
                "--trajectory-span-lane": span.lane,
                ...(hasSplit ? { "--trajectory-assistant-ttft": `${span.ttftMs! / (span.ttftMs! + span.decodingMs!) * 100}%` } : {}),
              } as CSSProperties} />;
          })}
        </div>
      </div>
    </div>
    {tip !== null && tipSpan !== undefined && draft === null &&
      <div role="tooltip" className="pointer-events-none absolute top-full z-(--act-z-popover) mt-1 max-w-[260px] whitespace-pre-line rounded-act-sm border border-line bg-surface-raised px-2 py-1.5 font-medium leading-[1.35] text-text-main shadow-act-popover"
        style={{ left: Math.max(0, tip.x - (rootRef.current?.getBoundingClientRect().left ?? 0)) }}>{timelineTooltipLabel(tipSpan)}</div>}
  </section>;
});

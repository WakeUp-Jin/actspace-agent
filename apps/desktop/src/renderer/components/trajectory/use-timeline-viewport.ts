import { useEffect, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { TrajectoryTimeline, TrajectoryTimelineMode, TrajectoryTimeRange } from "../../trajectory";

const MINIMUM_ZOOM_OPERATIONS = 4;
const MINIMUM_ZOOM_MS = 20;

export const clampFraction = (value: number) => Math.min(1, Math.max(0, value));

export type TimelineViewport = {
  /** Zoomed window in model coordinates, or null when the whole model is visible. */
  viewport: TrajectoryTimeRange | null;
  setViewport: Dispatch<SetStateAction<TrajectoryTimeRange | null>>;
  /** Whether the next viewport move should be animated (selection follow only). */
  animate: boolean;
  setAnimate: (animate: boolean) => void;
  fullDuration: number;
  domainStart: number;
  domainDuration: number;
};

/**
 * Visible model window for the trajectory timeline: wheel zoom anchored at the pointer, pan state, and
 * selection follow (a selected span outside the window moves the window to it).
 * Wheel is bound on `rootRef` as a non-passive native listener so it can prevent page scroll.
 */
export function useTimelineViewport(
  model: TrajectoryTimeline | null,
  mode: TrajectoryTimelineMode,
  selectedId: string | null,
  rootRef: RefObject<HTMLElement | null>,
  trackRef: RefObject<HTMLElement | null>,
): TimelineViewport {
  const [viewport, setViewport] = useState<TrajectoryTimeRange | null>(null);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (model === null) return;
    setAnimate(false);
    setViewport(current => current !== null && (current.end < model.start || current.start > model.end) ? null : current);
  }, [model]);

  useEffect(() => {
    if (model === null || selectedId === null) return;
    const selected = model.spans.find(span => span.recordId === selectedId);
    if (selected === undefined) return;
    setAnimate(true);
    setViewport(current => {
      if (current === null) return current;
      if (selected.end > current.start && selected.start < current.end) return current;
      const duration = Math.max(1, current.end - current.start);
      const desired = selected.end <= current.start ? selected.start : selected.end - duration;
      const start = Math.min(Math.max(desired, model.start), Math.max(model.start, model.end - duration));
      return start === current.start ? current : { start, end: start + duration };
    });
  }, [model, selectedId]);

  const fullDuration = Math.max(1, (model?.end ?? 0) - (model?.start ?? 0));
  const viewportDuration = Math.min(fullDuration, Math.max(1, (viewport?.end ?? 0) - (viewport?.start ?? 0)));
  const viewportStart = model === null || viewport === null
    ? model?.start ?? 0
    : Math.min(Math.max(viewport.start, model.start), model.end - viewportDuration);
  const domainDuration = viewport === null ? fullDuration : viewportDuration;
  const domainStart = viewport === null ? model?.start ?? 0 : viewportStart;

  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const track = trackRef.current;
      if (track === null || model === null) return;
      setAnimate(false);
      const rect = track.getBoundingClientRect();
      const anchorFraction = clampFraction((event.clientX - rect.left) / Math.max(1, rect.width));
      const minimum = Math.min(mode === "sequence" ? MINIMUM_ZOOM_OPERATIONS : MINIMUM_ZOOM_MS, fullDuration);
      const nextDuration = Math.min(fullDuration, Math.max(minimum, domainDuration * Math.exp(event.deltaY * 0.0015)));
      if (nextDuration >= fullDuration * 0.999) {
        setViewport(null);
        return;
      }
      const anchorTime = domainStart + anchorFraction * domainDuration;
      const start = Math.min(Math.max(anchorTime - anchorFraction * nextDuration, model.start), model.end - nextDuration);
      setViewport({ start, end: start + nextDuration });
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [domainDuration, domainStart, fullDuration, mode, model, rootRef, trackRef]);

  return { viewport, setViewport, animate, setAnimate, fullDuration, domainStart, domainDuration };
}

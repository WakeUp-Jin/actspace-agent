import { useEffect, useRef, useState } from 'react';
import { selectTrajectory } from '@actspace/client/sessions';
import type { RuntimeV2TrajectorySnapshot } from '@actspace/shared/runtime-v2';
import { useOptionalSessionProjection } from '../../session';

const STREAMING_INTERVAL_MS = 120;

/**
 * Hold `value` until the next animation frame. Projection updates arrive once per Journal event
 * (every assistant chunk), so the builder runs at most once per frame. A first value, or a switch to
 * another session, commits immediately.
 */
export function useFrameCoalesced<T>(value: T, immediate: (committed: T, next: T) => boolean): T {
  const [committed, setCommitted] = useState(value);
  const latest = useRef(value);
  latest.current = value;
  const frame = useRef<number | null>(null);
  const pending = committed !== value;
  const commitNow = pending && immediate(committed, value);
  if (commitNow) setCommitted(value);
  useEffect(() => {
    if (!pending || commitNow || frame.current !== null) return;
    frame.current = requestAnimationFrame(() => { frame.current = null; setCommitted(latest.current); });
  });
  // A cancelled frame must not stay recorded: Fast Refresh and StrictMode rerun effects, and a stale
  // id would block every later frame.
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  return commitNow ? value : committed;
}

/** Fixture (dev/test only) → explicit snapshot prop → the selected session's projection. */
export function useTrajectorySource(input: RuntimeV2TrajectorySnapshot | null | undefined) {
  const projection = useOptionalSessionProjection();
  const cell = useFrameCoalesced(projection?.cell ?? null, (committed, next) => committed === null || next === null || committed.sessionId !== next.sessionId);
  const projected = cell ? selectTrajectory(cell) : null;
  const [fixture, setFixture] = useState<RuntimeV2TrajectorySnapshot | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV && import.meta.env.MODE !== 'test') return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let restoreTheme: (() => void) | null = null;
    // Fixtures load lazily so production bundles never include them.
    void import('../../trajectory/fixtures').then(({ loadTrajectoryFixtureFromUrl, trajectoryFixtureName, streamingReplay }) => {
      const loaded = cancelled ? null : loadTrajectoryFixtureFromUrl();
      if (!loaded) return;
      setFixture(loaded);
      const replay = streamingReplay(trajectoryFixtureName());
      if (replay) {
        // Replays the running turn chunk by chunk to review in-place streaming.
        let frame = 0;
        timer = setInterval(() => {
          frame += 1;
          setFixture(replay.frame(frame));
          if (frame >= replay.frames && timer !== null) clearInterval(timer);
        }, STREAMING_INTERVAL_MS);
      }
      // A fixture-only theme override makes both themes reviewable without IPC.
      const theme = new URLSearchParams(window.location.search).get('trajectoryTheme');
      if (theme !== 'light' && theme !== 'dark') return;
      const previous = document.documentElement.getAttribute('data-theme');
      document.documentElement.setAttribute('data-theme', theme);
      restoreTheme = () => { if (previous === null) document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', previous); };
    });
    return () => { cancelled = true; if (timer !== null) clearInterval(timer); restoreTheme?.(); };
  }, []);
  return { snapshot: fixture ?? (input !== undefined ? input : projected), isFixture: fixture !== null, projection, cell };
}

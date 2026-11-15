import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { selectTrajectory, type ClientSessionCell, type ClientSessionStore } from '@actspace/client/sessions';
import type { RuntimeTrajectorySnapshot } from '@actspace/shared/runtime-v2';
import type { RequestLiveOutput } from '@actspace/client/live';
import { useOptionalSessionProjection } from '../../session';

const STREAMING_INTERVAL_MS = 120;

/**
 * Hold `value` until the next animation frame. Projection updates arrive once per Journal event, so the
 * builder runs at most once per frame. A first value, or a switch to
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

/**
 * Fixture (dev/test only) → explicit snapshot prop → the selected session's projection.
 * With `sessionId` (a child agent shown in the right panel) it watches that Session through the bridge
 * instead, without changing the selected conversation, and never loads fixtures.
 */
export function useTrajectorySource(input: RuntimeTrajectorySnapshot | null | undefined, sessionId?: string) {
  const projection = useOptionalSessionProjection();
  const bridge = projection?.bridge;
  useEffect(() => sessionId && bridge ? bridge.watch(sessionId) : undefined, [sessionId, bridge]);
  // 子会话要自己订阅 store：投影 context 只跟着当前（父）会话的 cell 换新，子会话的数据到了不会让这里重渲染。
  const watched = useWatchedCell(projection?.store ?? null, sessionId);
  const target = sessionId === undefined ? projection?.cell ?? null : watched;
  const cell = useFrameCoalesced(target, (committed, next) => committed === null || next === null || committed.sessionId !== next.sessionId);
  const projected = cell ? selectTrajectory(cell) : null;
  const [fixture, setFixture] = useState<RuntimeTrajectorySnapshot | null>(null);
  const [fixtureLive, setFixtureLive] = useState<ReadonlyMap<string, RequestLiveOutput> | null>(null);
  useEffect(() => {
    if (sessionId !== undefined) return;
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
        // Replays the running reply chunk by chunk (live run output, the Journal stays put) to review in-place streaming.
        let frame = 0;
        timer = setInterval(() => {
          frame += 1;
          const next = replay.frame(frame);
          setFixture(next.snapshot);
          setFixtureLive(next.live);
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
  }, [sessionId]);
  /** 轨迹实际读的那个会话的 cell（右栏子会话时是子会话的）：加载中 / 出错的空状态看它，不看父会话。 */
  const sourceCell = sessionId === undefined ? projection?.cell ?? null : watched;
  return { snapshot: fixture ?? (input !== undefined ? input : projected), isFixture: fixture !== null, fixtureLive, projection, cell, sourceCell };
}

const subscribeNothing = () => () => undefined;

/** 订阅 store 里某个会话的 cell；`peek` 不是 `get`：`get` 在会话加载前每次都会造一个新的空 cell。 */
function useWatchedCell(store: ClientSessionStore | null, sessionId: string | undefined): ClientSessionCell | null {
  const subscribe = useCallback((onChange: () => void) => (store && sessionId !== undefined ? store.subscribe(onChange) : subscribeNothing()), [store, sessionId]);
  const getSnapshot = useCallback(() => (store && sessionId !== undefined ? store.peek(sessionId) : null), [store, sessionId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

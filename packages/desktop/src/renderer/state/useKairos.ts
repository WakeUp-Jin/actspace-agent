/**
 * Kairos 域的 React state hook（不引入额外 state 库；与现有 useState 风格一致）。
 *
 * 负责：
 * 1. 首次 mount 时 init：从 IPC 拉一次 state + recent events，订阅 stream。
 * 2. 维护事件流上限 500 条；超过裁掉最早。
 * 3. 用 `aggregateKairosEvents` 派生表格行。
 * 4. 给页面暴露 control / readConfig / writeConfig 包装方法（加 toast/错误 surface）。
 *
 * 没有 `window.kairos`（mock 模式）时返回一个本地占位实现，便于 storybook / 测试。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  aggregateKairosEvents,
  type KairosBridgeApi,
  type KairosControl,
  type KairosEventRow,
  type KairosRuntimeState,
  type SessionEvent,
} from "@actspace/shared";

const EVENT_BUFFER_LIMIT = 500;

function trimEventBuffer(events: SessionEvent[]): SessionEvent[] {
  if (events.length <= EVENT_BUFFER_LIMIT) return events;
  return events.slice(events.length - EVENT_BUFFER_LIMIT);
}

export interface UseKairosResult {
  bridgeAvailable: boolean;
  state: KairosRuntimeState | null;
  events: SessionEvent[];
  rows: KairosEventRow[];
  selectedRowId: string | null;
  /** 当前选中行关联的 SessionEvent 子集（按 row.relatedEventIds 查表）。 */
  selectedEvents: SessionEvent[];
  loading: boolean;
  error: string | null;
  selectRow(id: string | null): void;
  control(ctrl: KairosControl): Promise<void>;
  /** UI 主动刷新（一般不需要，stream 会推；首次失败时可重试）。 */
  refresh(): Promise<void>;
  readConfig(name: "preferences" | "paths" | "blocklist" | "rule"): Promise<{ content: string; fileName: string; notFound: boolean }>;
  writeConfig(name: "preferences" | "paths" | "blocklist" | "rule", content: string): Promise<void>;
}

function getBridge(): KairosBridgeApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { kairos?: KairosBridgeApi }).kairos;
}

export function useKairos(): UseKairosResult {
  const [bridge] = useState<KairosBridgeApi | undefined>(() => getBridge());
  const bridgeAvailable = Boolean(bridge);

  const [state, setState] = useState<KairosRuntimeState | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // events 的最新值放到 ref，stream 回调内闭包用，避免每个事件 trigger re-subscribe。
  const eventsRef = useRef<SessionEvent[]>([]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const refresh = useCallback(async () => {
    if (!bridge) return;
    setLoading(true);
    setError(null);
    try {
      const [s, recent] = await Promise.all([
        bridge.getState(),
        bridge.getEventsRecent({ limit: 200 }),
      ]);
      setState(s);
      setEvents(recent.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    void refresh();
    const offEvent = bridge.onEvent((ev) => {
      setEvents((current) => {
        const next = trimEventBuffer([...current, ev]);
        eventsRef.current = next;
        return next;
      });
    });
    const offState = bridge.onState((s) => {
      setState(s);
    });
    return () => {
      offEvent();
      offState();
    };
  }, [bridge, refresh]);

  const rows = useMemo(() => aggregateKairosEvents(events), [events]);

  const selectedEvents = useMemo(() => {
    if (!selectedRowId) return [];
    const row = rows.find((r) => r.id === selectedRowId);
    if (!row) return [];
    const ids = new Set(row.relatedEventIds);
    return events.filter((e) => ids.has(e.id));
  }, [rows, events, selectedRowId]);

  const control = useCallback(
    async (ctrl: KairosControl) => {
      if (!bridge) throw new Error("kairos bridge unavailable");
      setError(null);
      try {
        await bridge.control(ctrl);
        if (ctrl.type === "reset_today") {
          eventsRef.current = [];
          setEvents([]);
          setSelectedRowId(null);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      }
    },
    [bridge],
  );

  const readConfig = useCallback(
    async (name: "preferences" | "paths" | "blocklist" | "rule") => {
      if (!bridge) throw new Error("kairos bridge unavailable");
      return bridge.readConfig({ name });
    },
    [bridge],
  );

  const writeConfig = useCallback(
    async (name: "preferences" | "paths" | "blocklist" | "rule", content: string) => {
      if (!bridge) throw new Error("kairos bridge unavailable");
      setError(null);
      try {
        await bridge.writeConfig({ name, content });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      }
    },
    [bridge],
  );

  return {
    bridgeAvailable,
    state,
    events,
    rows,
    selectedRowId,
    selectedEvents,
    loading,
    error,
    selectRow: setSelectedRowId,
    control,
    refresh,
    readConfig,
    writeConfig,
  };
}

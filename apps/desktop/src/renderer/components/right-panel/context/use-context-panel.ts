import { useEffect, useRef, useState } from "react";
import type { ContextState } from "@actspace/shared";
import { liveEvents } from "../../../api/live-events";
import { sessionsApi } from "../../../api/sessions";
import { useOptionalSessionProjection } from "../../../session";
import { buildInterimPanelView, type ContextPanelData } from "./context-panel-model";

/** One visible consumer, one in-flight refresh. A generation change replaces the
 * view even if its Journal sequence is lower (for example after restoration). */
export function useContextPanel({ sessionId, revision, fallbackState }: {
  sessionId: string | null; revision: number | undefined; fallbackState: ContextState | null;
}) {
  const projection = useOptionalSessionProjection();
  const latest = useRef({ snapshot: projection?.cell?.snapshot, fallbackState });
  latest.current = { snapshot: projection?.sessionId === sessionId ? projection.cell?.snapshot : null, fallbackState };
  const [data, setData] = useState<ContextPanelData | null>(null);
  const dataRef = useRef(data); dataRef.current = data;
  const [loading, setLoading] = useState(false);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useRef<(retry?: boolean) => void>(() => {});
  useEffect(() => {
    setData(null); dataRef.current = null; setError(null); setPaging(false);
    if (!sessionId) return;
    const consumerId = `context-${crypto.randomUUID()}`;
    let stopped = false, active = false, pending = false, retryRequested = false, failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const release = () => { void sessionsApi.describeContextPanel({ sessionId, consumerId, release: true }).catch(() => {}); };
    const run = async (retry = false) => {
      retryRequested ||= retry;
      if (stopped || document.hidden) return;
      if (active) { pending = true; return; }
      clearTimeout(timer); active = true; setLoading(true);
      try {
        const panel = await sessionsApi.describeContextPanel({ sessionId, consumerId, versionToken: dataRef.current?.view.versionToken, retry: retryRequested });
        retryRequested = false;
        if (stopped) return;
        if (panel && "notModified" in panel) {
          setData(previous => previous ? { ...previous, view: { ...previous.view, versionToken: panel.versionToken, history: panel.history } } : previous);
        } else if (panel && "schemaVersion" in panel) {
          const next: ContextPanelData = { view: panel, source: "backend" };
          dataRef.current = next; setData(next);
        } else {
          const described = await sessionsApi.describeContext({ sessionId });
          if (stopped) return;
          const { snapshot, fallbackState: fallback } = latest.current;
          const next = buildInterimPanelView({ sessionId, contextState: described ?? fallback, activity: snapshot?.activity ?? null, usage: snapshot?.usage ?? null });
          dataRef.current = next; setData(next);
        }
        failures = 0; setError(null);
      } catch (reason) {
        if (!stopped) { failures++; setError(reason instanceof Error ? reason.message : "读取上下文失败"); }
      } finally {
        active = false;
        if (!stopped) {
          setLoading(false);
          const history = dataRef.current?.view.history;
          const delay = pending ? 0 : failures ? Math.min(10000, 1000 * 2 ** failures) : history?.status === "syncing" || history?.status === "rebuilding" ? 1000 : 5000;
          pending = false;
          if (!document.hidden) timer = setTimeout(() => void run(), delay);
        }
      }
    };
    refresh.current = retry => void run(retry);
    const visibility = () => { if (document.hidden) { clearTimeout(timer); release(); } else void run(); };
    const unsubscribe = liveEvents.onMessage("context-updated", ({ event }) => { if (event.sessionId === sessionId) void run(); });
    document.addEventListener("visibilitychange", visibility);
    void run();
    return () => { unsubscribe(); stopped = true; refresh.current = () => {}; clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); release(); };
  }, [sessionId]);
  const previousRevision = useRef(revision);
  useEffect(() => { if (previousRevision.current !== revision) { previousRevision.current = revision; refresh.current(); } }, [revision]);
  const loadMore = async () => {
    const before = dataRef.current;
    const page = before?.view.entriesPage;
    if (!sessionId || !before || !page?.nextCursor || !page.revision || paging) return;
    setPaging(true);
    try {
      const next = await sessionsApi.listContextEntries({ sessionId, revision: page.revision, cursor: page.nextCursor });
      setData(current => {
        if (!current || current.view.sessionId !== sessionId || current.view.entriesPage?.revision !== next.revision || current.view.entriesPage.nextCursor !== page.nextCursor) return current;
        const merged = { ...current, view: { ...current.view, current: { ...current.view.current, entries: [...next.entries, ...current.view.current.entries] }, previous: current.view.previous ? { ...current.view.previous, entries: [...next.previous, ...current.view.previous.entries] } : null, entriesPage: { revision: next.revision, total: next.total, truncated: !!next.nextCursor, nextCursor: next.nextCursor } } };
        dataRef.current = merged; return merged;
      });
    } catch (reason) { if (dataRef.current?.view.sessionId === sessionId) setError(reason instanceof Error ? reason.message : "读取更多条目失败"); }
    finally { setPaging(false); }
  };
  return { data, loading, error, paging, loadMore, retry: () => refresh.current(true), refresh: () => refresh.current() };
}

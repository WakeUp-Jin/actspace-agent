import { useCallback, useEffect, useRef, useState } from "react";
import type { ContextDisclosureSummary, ContextPathEntry } from "@actspace/shared";
import { sessionsApi } from "../../../api/sessions";
import { PATH_PAGE_LIMIT, isContextPathRevisionError, type ContextPathVisibility } from "./context-paths-model";

export type ContextPathList = {
  paths: ContextPathEntry[];
  total: number;
  nextCursor?: string;
  /** 已读到首屏；版本失效被清空时回到 false，由 effect 重新读首屏。 */
  loaded: boolean;
  loading: boolean;
  error: string | null;
  /** 本版本已因 stale / cursor 错误自动恢复过一次；再出错就停下等用户重试。 */
  recovered: boolean;
};

type Lists = { scope: string | null; byVisibility: Partial<Record<ContextPathVisibility, ContextPathList>> };

const EMPTY: ContextPathList = { paths: [], total: 0, loaded: false, loading: false, error: null, recovered: false };

/**
 * 「路径」卡片的分页读取（交接文档 §3）。状态按 (sessionId, disclosure.revision, visibility) 建键：
 * 版本变化时丢掉旧页，响应要核对 revision / visibility 并按 id 去重；列表收起（enabled=false）或页面隐藏时不发请求。
 * 同一列表同时只有一个请求在途。版本过期 / 游标失效时清空并请面板刷新一次，之后的错误留给用户重试。
 */
export function useContextPaths({ sessionId, disclosure, visibility, enabled, onStale }: {
  sessionId: string;
  disclosure: ContextDisclosureSummary | undefined;
  visibility: ContextPathVisibility;
  enabled: boolean;
  onStale: () => void;
}) {
  const revision = disclosure?.status === "ready" ? disclosure.revision : null;
  const scope = revision === null ? null : JSON.stringify([sessionId, revision]);
  const [lists, setLists] = useState<Lists>({ scope, byVisibility: {} });
  const listsRef = useRef(lists); listsRef.current = lists;
  const inflight = useRef(new Set<string>());
  const mounted = useRef(true);
  const onStaleRef = useRef(onStale); onStaleRef.current = onStale;
  const [visibleTick, setVisibleTick] = useState(0);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const onVisibility = () => { if (!document.hidden) setVisibleTick(tick => tick + 1); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const update = useCallback((target: string, which: ContextPathVisibility, change: (list: ContextPathList) => ContextPathList) => {
    setLists(current => current.scope !== target ? current : { scope: target, byVisibility: { ...current.byVisibility, [which]: change(current.byVisibility[which] ?? EMPTY) } });
  }, []);

  const load = useCallback(async (which: ContextPathVisibility, cursor?: string) => {
    if (revision === null || scope === null || document.hidden) return;
    const key = `${scope}|${which}`;
    if (inflight.current.has(key)) return;
    inflight.current.add(key);
    update(scope, which, list => ({ ...list, loading: true, error: null }));
    try {
      const page = await sessionsApi.listContextPaths({ sessionId, revision, visibility: which, limit: PATH_PAGE_LIMIT, ...(cursor ? { cursor } : {}) });
      if (!mounted.current) return;
      if (page.revision !== revision || page.visibility !== which) { update(scope, which, list => ({ ...list, loading: false, error: "路径版本不一致，请重试。" })); return; }
      update(scope, which, list => {
        const base = cursor ? list.paths : [];
        const seen = new Set(base.map(path => path.id));
        const fresh = page.paths.filter(path => !seen.has(path.id) && Boolean(seen.add(path.id)));
        return { ...list, paths: [...base, ...fresh], total: page.total, nextCursor: page.nextCursor, loaded: true, loading: false, error: null };
      });
    } catch (reason) {
      if (!mounted.current) return;
      const message = reason instanceof Error ? reason.message : "读取路径失败";
      const current = listsRef.current.scope === scope ? listsRef.current.byVisibility[which] : undefined;
      if (isContextPathRevisionError(message) && !current?.recovered) {
        update(scope, which, () => ({ ...EMPTY, recovered: true }));
        onStaleRef.current();
      } else {
        update(scope, which, list => ({ ...list, loading: false, error: message }));
      }
    } finally {
      inflight.current.delete(key);
    }
  }, [revision, scope, sessionId, update]);

  // 版本变化：换成新版本的空状态，旧页不和新版本拼接。
  useEffect(() => { setLists(current => current.scope === scope ? current : { scope, byVisibility: {} }); }, [scope]);

  const list = lists.scope === scope ? lists.byVisibility[visibility] ?? null : null;
  const needsFirstPage = !list || (!list.loaded && !list.loading && !list.error);
  useEffect(() => {
    if (enabled && scope !== null && lists.scope === scope && needsFirstPage) void load(visibility);
  }, [enabled, scope, lists.scope, needsFirstPage, visibility, load, visibleTick]);

  return {
    list,
    loadMore: () => { if (list?.nextCursor && !list.loading) void load(visibility, list.nextCursor); },
    retry: () => { void load(visibility, list?.loaded ? list.nextCursor : undefined); },
  };
}

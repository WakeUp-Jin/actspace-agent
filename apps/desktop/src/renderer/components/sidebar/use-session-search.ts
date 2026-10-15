import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionListPage } from "@actspace/shared";
import { sessionsApi } from "../../api/sessions";

export const SESSION_SEARCH_DEBOUNCE_MS = 250;
const SESSION_SEARCH_PAGE_SIZE = 50;

/**
 * 按标题和消息片段搜本机会话（不依赖侧栏已加载的页）：输入停 250ms 再查，旧请求的结果丢弃。
 * 翻页替换当前页，长时间搜索时 DOM 和内存都有上限。
 */
export function useSessionSearch(query: string, enabled: boolean) {
  const [page, setPage] = useState<SessionListPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const search = query.trim();
  useEffect(() => {
    const current = ++generation.current;
    setPage(null); setError(null); setLoading(false);
    if (!enabled || !search) return;
    const timer = setTimeout(() => {
      setLoading(true);
      void sessionsApi.listPage({ search, limit: SESSION_SEARCH_PAGE_SIZE }).then(result => {
        if (generation.current === current) setPage(result);
      }).catch(reason => {
        if (generation.current === current) setError(reason instanceof Error ? reason.message : "会话搜索失败");
      }).finally(() => { if (generation.current === current) setLoading(false); });
    }, SESSION_SEARCH_DEBOUNCE_MS);
    return () => { clearTimeout(timer); generation.current++; };
  }, [enabled, search]);
  const next = useCallback(async () => {
    if (!enabled || !page?.nextCursor || loading) return;
    const current = generation.current;
    setLoading(true); setError(null);
    try {
      const result = await sessionsApi.listPage({ search, limit: SESSION_SEARCH_PAGE_SIZE, after: page.nextCursor });
      if (generation.current === current) setPage(result);
    } catch (reason) { if (generation.current === current) setError(reason instanceof Error ? reason.message : "会话搜索失败"); }
    finally { if (generation.current === current) setLoading(false); }
  }, [enabled, loading, page?.nextCursor, search]);
  return { page, loading, error, next };
}

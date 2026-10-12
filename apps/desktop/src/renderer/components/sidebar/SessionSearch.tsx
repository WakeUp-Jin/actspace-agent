import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { SessionListPage } from "@actspace/shared";
import { sessionsApi } from "../../api/sessions";
import { Button } from "../ui/Button";
import { SettingsInput } from "../settings/SettingsPrimitives";

/** Independent bounded search; opening a result uses the ordinary Session path. */
export function SessionSearch({ onSelect, buttonLabel = "搜索本机会话", disabled = false }: { onSelect(id: string, title?: string): void; buttonLabel?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState<SessionListPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    setPage(null); setError(null); setLoading(false);
    if (disabled || !open || !search.trim()) return;
    const timer = setTimeout(() => {
      setLoading(true);
      void sessionsApi.listPage({ search: search.trim(), limit: 50 }).then(result => {
        if (generation.current === current) setPage(result);
      }).catch(reason => {
        if (generation.current === current) setError(reason instanceof Error ? reason.message : "会话搜索失败");
      }).finally(() => { if (generation.current === current) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); generation.current++; };
  }, [disabled, open, search]);
  async function next() {
    if (disabled || !page?.nextCursor || loading) return;
    const current = generation.current;
    setLoading(true); setError(null);
    try {
      const result = await sessionsApi.listPage({ search: search.trim(), limit: 50, after: page.nextCursor });
      // Replace the visible page, keeping DOM and memory bounded across long searches.
      if (generation.current === current) setPage(result);
    } catch (reason) { if (generation.current === current) setError(reason instanceof Error ? reason.message : "会话搜索失败"); }
    finally { if (generation.current === current) setLoading(false); }
  }
  return <section aria-label={buttonLabel} className="min-w-0">
    <Button variant="ghost" size="md" disabled={disabled} aria-expanded={open} onClick={() => setOpen(value => !value)} className="w-full justify-start"><Search size={14} /><span>{buttonLabel}</span></Button>
    {open && !disabled ? <div className="flex flex-col gap-2 px-2 pb-2">
      <SettingsInput autoFocus aria-label="搜索会话标题和片段" placeholder="标题或消息片段" maxLength={300} value={search} onChange={event => setSearch(event.target.value)} />
      {loading ? <p role="status" className="text-act-xs text-text-muted">正在搜索会话…</p> : null}
      {error ? <p role="alert" className="text-act-xs text-warning">{error}</p> : null}
      {page?.readModel?.status === "fallback" ? <p role="status" className="text-act-xs text-text-muted">查询索引暂不可用，已从会话文件读取</p> : null}
      {page && !page.items.length ? <p className="text-act-xs text-text-faint">没有匹配的本机会话</p> : null}
      <div className="max-h-60 overflow-auto" aria-label="会话搜索结果">
        {page?.items.map(item => <Button variant="ghost" size="xs" key={item.id} onClick={() => { onSelect(item.id, item.title); setOpen(false); }} className="w-full justify-start overflow-hidden" title={item.title}><span className="truncate">{item.title}</span></Button>)}
      </div>
      {page?.nextCursor ? <Button size="sm" variant="ghost" disabled={loading} onClick={() => void next()}>下一页结果</Button> : null}
    </div> : null}
  </section>;
}

import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "../ui/Button";
import { SettingsInput } from "../settings/SettingsPrimitives";
import { useSessionSearch } from "./use-session-search";

/** Independent bounded search; opening a result uses the ordinary Session path. 侧栏用的是标题行里的搜索，这里给设置页用。 */
export function SessionSearch({ onSelect, buttonLabel = "搜索本机会话", disabled = false }: { onSelect(id: string, title?: string): void; buttonLabel?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { page, loading, error, next } = useSessionSearch(search, open && !disabled);
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

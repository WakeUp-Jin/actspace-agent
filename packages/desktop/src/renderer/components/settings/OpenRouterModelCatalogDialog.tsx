import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Search, X } from "lucide-react";
import type { CatalogModelView, ModelsCatalogListResult } from "@actspace/shared";
import { useDialogFocusTrap } from "./useDialogFocusTrap";

const ROW_HEIGHT = 92;
const VIEWPORT_HEIGHT = 460;
const OVERSCAN = 4;

export function OpenRouterModelCatalogDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void | Promise<void> }) {
  const [result, setResult] = useState<ModelsCatalogListResult | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const { dialogRef, trapTabKey } = useDialogFocusTrap();

  useEffect(() => { const timer = window.setTimeout(() => setDebouncedQuery(query), 250); return () => window.clearTimeout(timer); }, [query]);
  useEffect(() => {
    if (!window.actspace.listModelCatalog) return;
    setLoading(true);
    window.actspace.listModelCatalog({ provider: "openrouter", query: debouncedQuery }).then(setResult).finally(() => setLoading(false));
  }, [debouncedQuery]);

  const reload = async () => {
    if (!window.actspace.reloadModelCatalog) return;
    setLoading(true);
    try { setResult(await window.actspace.reloadModelCatalog({ provider: "openrouter", query: debouncedQuery })); }
    finally { setLoading(false); }
  };

  const add = async (model: CatalogModelView) => {
    if (!window.actspace.addModel) return;
    setAdding(model.apiModel);
    try {
      const mutation = await window.actspace.addModel({ provider: "openrouter", apiModel: model.apiModel });
      if (mutation.ok) {
        await onAdded();
        setResult((current) => current ? { ...current, models: current.models.map((item) => item.apiModel === model.apiModel ? { ...item, added: true } : item) } : current);
      }
    } finally { setAdding(null); }
  };

  const models = result?.models ?? [];
  const windowed = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const count = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2;
    return { start, items: models.slice(start, start + count) };
  }, [models, scrollTop]);

  return (
    <div ref={dialogRef} tabIndex={-1} className="fixed inset-0 z-[160] grid place-items-center bg-scrim px-5" role="dialog" aria-modal="true" aria-labelledby="catalog-title" onKeyDown={(event) => { if (event.key === "Escape") onClose(); else trapTabKey(event); }}>
      <div className="flex max-h-[min(760px,calc(100vh-40px))] w-full max-w-[760px] flex-col overflow-hidden rounded-act-xl border border-line bg-surface shadow-act-float">
        <header className="border-b border-line px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-4"><div><h2 id="catalog-title" className="text-[18px] font-semibold text-text-main">为 OpenRouter 添加模型</h2><p className="mt-1 text-[12px] text-text-faint">目录模型只在手动添加后进入 Actspace；添加后仍可停用或删除。</p></div><button ref={closeButtonRef} type="button" aria-label="关闭模型目录" className="grid h-10 w-10 place-items-center rounded-act-md text-text-faint hover:bg-surface-subtle" onClick={onClose}><X size={18} /></button></div>
          <div className="mt-4 flex gap-2"><label className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" size={16} /><span className="sr-only">搜索模型</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型 ID 或名称…" className="h-10 w-full rounded-act-md border border-line bg-surface-subtle pl-9 pr-3 text-[13px] text-text-main outline-none focus:border-brand" /></label><button type="button" className="inline-flex h-10 items-center gap-1.5 rounded-act-md border border-line px-3 text-[12px] font-semibold text-text-main hover:border-brand/40" onClick={() => void reload()} disabled={loading}><RefreshCw size={15} className={loading ? "animate-spin" : ""} />重新加载</button></div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-text-faint"><span>共 {models.length} 个模型 · {result?.state ?? "missing"}{result?.stale ? " · 缓存已过期" : ""}</span><span>{result?.fetchedAt ? new Date(result.fetchedAt).toLocaleString() : "尚无缓存"}</span></div>
          {result?.error ? <p className="mt-2 text-[12px] text-on-danger">{result.error.message}</p> : null}
        </header>
        <div className="relative overflow-y-auto" style={{ height: VIEWPORT_HEIGHT }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)} role="listbox" aria-label="OpenRouter 模型目录">
          {loading && !result ? <div className="grid h-full place-items-center text-text-faint"><Loader2 className="animate-spin" size={22} /></div> : null}
          {!loading && models.length === 0 ? <div className="grid h-full place-items-center px-6 text-center text-[13px] text-text-faint">没有找到模型。可检查连接或重新加载目录。</div> : null}
          <div style={{ height: models.length * ROW_HEIGHT, position: "relative" }}>
            {windowed.items.map((model, offset) => <CatalogRow key={model.apiModel} model={model} top={(windowed.start + offset) * ROW_HEIGHT} adding={adding === model.apiModel} onAdd={() => void add(model)} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function CatalogRow({ model, top, adding, onAdd }: { model: CatalogModelView; top: number; adding: boolean; onAdd: () => void }) {
  return (
    <div className="absolute left-0 right-0 flex items-center justify-between gap-4 border-b border-line px-5" style={{ top, height: ROW_HEIGHT }} role="option" aria-selected={model.added}>
      <div className="min-w-0"><div className="truncate text-[13px] font-semibold text-text-main">{model.name}</div><div className="mt-1 truncate font-mono text-[11px] text-text-faint">{model.apiModel}</div><div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-text-muted"><span>{model.contextWindow ? `${Math.round(model.contextWindow / 1000)}K context` : "context 未知"}</span><span>·</span><span>{model.isFree ? "免费" : model.pricing ? `$${model.pricing.inputCacheMissPerMillion}/$${model.pricing.outputPerMillion} / 1M` : "价格未知"}</span>{model.input.includes("image") ? <span>· 图像</span> : null}{model.toolUse === "declared" ? <span>· Tools</span> : null}{model.reasoning ? <span>· Reasoning</span> : null}</div></div>
      <button type="button" className="h-9 min-w-[76px] rounded-act-md border border-line px-3 text-[12px] font-semibold text-text-main hover:border-brand/40 disabled:cursor-default disabled:opacity-60" disabled={model.added || adding} onClick={onAdd}>{model.added ? "已添加" : adding ? "添加中…" : "添加"}</button>
    </div>
  );
}

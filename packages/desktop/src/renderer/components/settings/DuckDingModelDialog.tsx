import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Search, X } from "lucide-react";
import type { ModelMetadataCatalogResult, ModelMetadataView, ProviderSettingsView } from "@actspace/shared";
import { useDialogFocusTrap } from "./useDialogFocusTrap";

export function DuckDingModelDialog({
  provider,
  onClose,
  onAdded,
}: {
  provider?: ProviderSettingsView;
  onClose: () => void;
  onAdded: () => void | Promise<void>;
}) {
  const [apiModel, setApiModel] = useState("");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ModelMetadataCatalogResult | null>(null);
  const [selectedMetadataKey, setSelectedMetadataKey] = useState<string | null>(null);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoReloadedRef = useRef(false);
  const { dialogRef, trapTabKey } = useDialogFocusTrap();
  const credentials = provider?.additionalCredentials ?? [];

  useEffect(() => {
    if (!credentialId && !provider?.hasApiKey) {
      setCredentialId(credentials.find((credential) => credential.hasApiKey)?.id ?? null);
    }
  }, [credentialId, credentials, provider?.hasApiKey]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!window.actspace.searchModelMetadata) return;
      setLoading(true);
      window.actspace.searchModelMetadata({ query })
        .then(async (next) => {
          if (cancelled) return;
          setResult(next);
          if (!autoReloadedRef.current && next.state === "empty" && window.actspace.reloadModelMetadata) {
            autoReloadedRef.current = true;
            setReloading(true);
            const reloaded = await window.actspace.reloadModelMetadata();
            if (cancelled) return;
            const filtered = query.trim() && window.actspace.searchModelMetadata
              ? await window.actspace.searchModelMetadata({ query })
              : reloaded;
            if (!cancelled) setResult(filtered);
          }
        })
        .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "公共模型目录读取失败。"); })
        .finally(() => { if (!cancelled) { setLoading(false); setReloading(false); } });
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query]);

  const selected = useMemo(
    () => result?.models.find((model) => model.key === selectedMetadataKey),
    [result, selectedMetadataKey],
  );
  const multiplier = credentialId
    ? credentials.find((credential) => credential.id === credentialId)?.pricingMultiplier ?? 1
    : provider?.defaultPricingMultiplier ?? 1;
  const credentialAvailable = credentialId
    ? credentials.some((credential) => credential.id === credentialId && credential.hasApiKey)
    : provider?.hasApiKey !== false;

  const reload = async () => {
    if (!window.actspace.reloadModelMetadata) return;
    setReloading(true); setError(null);
    try {
      const next = await window.actspace.reloadModelMetadata();
      setResult(query.trim() && window.actspace.searchModelMetadata
        ? await window.actspace.searchModelMetadata({ query })
        : next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "公共模型目录刷新失败。");
    } finally { setReloading(false); }
  };

  const save = async () => {
    if (!window.actspace.addModel) return;
    setSaving(true); setError(null);
    try {
      const mutation = await window.actspace.addModel({
        provider: "duckding",
        apiModel: apiModel.trim(),
        metadataKey: selectedMetadataKey,
        credentialId,
      });
      if ("error" in mutation) { setError(mutation.error.message); return; }
      await onAdded();
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div ref={dialogRef} tabIndex={-1} className="fixed inset-0 z-[160] grid place-items-center bg-scrim px-5" role="dialog" aria-modal="true" aria-labelledby="duckding-model-title" onKeyDown={(event) => { if (event.key === "Escape") onClose(); else trapTabKey(event); }}>
      <div className="max-h-[88vh] w-full max-w-[680px] overflow-y-auto rounded-act-xl border border-line bg-surface p-5 shadow-act-float">
        <div className="flex items-start justify-between gap-4">
          <div><h2 id="duckding-model-title" className="text-[18px] font-semibold text-text-main">添加 DuckDing 模型</h2><p className="mt-1 text-[12px] text-text-faint">只需填写 API 模型名；能力与基础价格可以从公共目录选择。</p></div>
          <button type="button" aria-label="关闭 DuckDing 模型" className="grid h-10 w-10 place-items-center rounded-act-md text-text-faint hover:bg-surface-subtle" onClick={onClose}><X size={18} /></button>
        </div>

        <label className="mt-5 grid gap-1.5"><span className="text-[12px] font-semibold text-text-muted">API 模型名</span><input autoFocus aria-label="DuckDing API 模型名" value={apiModel} onChange={(event) => { setApiModel(event.target.value); setQuery(event.target.value); }} placeholder="例如 grok-4.5" className="h-10 rounded-act-md border border-line bg-surface-subtle px-3 font-mono text-[13px] text-text-main outline-none focus:ring-2 focus:ring-[var(--act-color-focus-ring)]" /></label>

        {credentials.length > 0 ? (
          <label className="mt-4 grid gap-1.5"><span className="text-[12px] font-semibold text-text-muted">调用 Key</span><select aria-label="DuckDing 模型调用 Key" value={credentialId ?? ""} onChange={(event) => setCredentialId(event.target.value || null)} className="h-10 rounded-act-md border border-line bg-surface-subtle px-3 text-[13px] text-text-main outline-none focus:ring-2 focus:ring-[var(--act-color-focus-ring)]"><option value="" disabled={!provider?.hasApiKey}>默认 Key · {provider?.defaultPricingMultiplier ?? 1}x{provider?.hasApiKey ? "" : "（未配置）"}</option>{credentials.map((credential) => <option key={credential.id} value={credential.id} disabled={!credential.hasApiKey}>{credential.label} · {credential.pricingMultiplier}x{credential.hasApiKey ? "" : "（不可用）"}</option>)}</select><span className="text-[11px] text-text-faint">这里只能选择供应商页已经添加的 Key。</span></label>
        ) : null}

        <section className="mt-5 rounded-act-lg border border-line bg-surface-subtle p-3">
          <div className="flex items-center justify-between gap-3"><div><h3 className="text-[13px] font-semibold text-text-main">公共模型元数据</h3><p className="mt-0.5 text-[11px] text-text-faint">models.dev 为主源，OpenRouter 公共列表为补充。</p></div><button type="button" disabled={reloading} onClick={() => void reload()} className="inline-flex h-8 items-center gap-1.5 rounded-act-md border border-line bg-surface px-2.5 text-[11px] font-medium text-text-muted hover:border-line-strong disabled:opacity-40"><RefreshCw size={13} className={reloading ? "animate-spin motion-reduce:animate-none" : ""} />{reloading ? "加载中…" : "刷新目录"}</button></div>
          <div className="relative mt-3"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" /><input aria-label="搜索公共模型元数据" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型名称或 ID" className="h-9 w-full rounded-act-md border border-line bg-surface pl-9 pr-3 text-[12px] text-text-main outline-none focus:ring-2 focus:ring-[var(--act-color-focus-ring)]" /></div>
          {result?.error ? <p role="status" className="mt-2 text-[11px] text-on-danger">{result.error.message}</p> : null}
          <div className="mt-2 max-h-[240px] overflow-y-auto rounded-act-md border border-line bg-surface">
            <label className="flex cursor-pointer items-start gap-2.5 border-b border-line px-3 py-2.5 last:border-b-0"><input type="radio" name="metadata" checked={selectedMetadataKey === null} onChange={() => setSelectedMetadataKey(null)} /><span><span className="block text-[12px] font-medium text-text-main">不关联公共元数据</span><span className="mt-0.5 block text-[10px] text-text-faint">仍然添加模型，能力和价格显示为未知。</span></span></label>
            {loading ? <div className="flex items-center gap-2 px-3 py-4 text-[11px] text-text-faint"><Loader2 size={14} className="animate-spin motion-reduce:animate-none" />搜索中…</div> : null}
            {!loading && result?.models.map((model) => <MetadataOption key={model.key} model={model} checked={selectedMetadataKey === model.key} onSelect={() => setSelectedMetadataKey(model.key)} />)}
            {!loading && query.trim() && result?.models.length === 0 ? <p className="px-3 py-4 text-[11px] text-text-faint">没有匹配项，可以选择“不关联公共元数据”继续添加。</p> : null}
          </div>
        </section>

        <PricePreview model={selected} multiplier={multiplier} />
        {error ? <p role="alert" className="mt-3 text-[12px] text-on-danger">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="h-10 rounded-act-md border border-line px-4 text-[13px] font-semibold text-text-main hover:bg-surface-subtle">取消</button><button type="button" disabled={saving || !apiModel.trim() || !credentialAvailable} onClick={() => void save()} className="h-10 rounded-act-md bg-text-main px-4 text-[13px] font-semibold text-surface disabled:opacity-40">{saving ? "添加中…" : "添加模型"}</button></div>
      </div>
    </div>
  );
}

function MetadataOption({ model, checked, onSelect }: { model: ModelMetadataView; checked: boolean; onSelect: () => void }) {
  return <label className="flex cursor-pointer items-start gap-2.5 border-b border-line px-3 py-2.5 last:border-b-0"><input type="radio" name="metadata" checked={checked} onChange={onSelect} /><span className="min-w-0"><span className="flex flex-wrap items-center gap-1.5"><span className="text-[12px] font-medium text-text-main">{model.name}</span><span className="rounded-act-pill bg-surface-subtle px-1.5 py-0.5 text-[9px] text-text-faint">{model.source} · {model.provider}</span></span><span className="mt-0.5 block truncate font-mono text-[10px] text-text-faint">{model.modelId}</span><span className="mt-1 block text-[10px] text-text-muted">{model.contextWindow ? `${Math.round(model.contextWindow / 1000)}K context` : "context 未知"} · tools {model.capabilities.toolUse} · {model.capabilities.reasoning ? "reasoning" : "普通"}</span></span></label>;
}

function PricePreview({ model, multiplier }: { model?: ModelMetadataView; multiplier: number }) {
  if (!model?.pricing) return <p className="mt-3 rounded-act-md bg-surface-subtle px-3 py-2 text-[11px] text-text-faint">当前没有基础价格；倍率不会凭空生成价格，Usage 将显示为未知。</p>;
  const pricing = model.pricing;
  const rows = [
    ["输入", pricing.inputCacheMissPerMillion],
    ["输出", pricing.outputPerMillion],
    ["缓存读取", pricing.inputCacheHitPerMillion],
    ...(pricing.inputCacheWritePerMillion === undefined ? [] : [["缓存写入", pricing.inputCacheWritePerMillion] as const]),
  ] as const;
  return <div className="mt-3 rounded-act-md border border-line bg-surface-subtle px-3 py-2.5"><div className="flex items-center justify-between gap-3 text-[11px]"><span className="font-medium text-text-main">价格预估</span><span className="text-text-faint">{model.source} · {model.provider} 基础价 × {multiplier}x</span></div><div className="mt-1.5 grid grid-cols-2 gap-2 text-[11px] text-text-muted">{rows.map(([label, value]) => <span key={label}>{label} {formatPrice(value)} → {formatPrice(value * multiplier)}</span>)}</div><p className="mt-1.5 text-[10px] text-text-faint">按公共目录与本地倍率估算，实际账单以服务商为准。</p></div>;
}

function formatPrice(value: number): string {
  return `$${Number(value.toFixed(6))}/1M`;
}

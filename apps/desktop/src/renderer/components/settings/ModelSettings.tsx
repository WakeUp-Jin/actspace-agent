import { CustomModelReasoningFields } from "./CustomModelReasoningFields";
import type { CustomModelReasoning } from "@actspace/shared";
import { useEffect, useRef, useState } from "react";
import { Boxes, Check, ChevronDown, Plus, Search, Trash2 } from "lucide-react";
import { PROVIDER_IDS, PROVIDER_REGISTRY, type AppSettings, type InstalledModelView, type ModelKey, type ProviderSettingsView, type LlmProviderId } from "@actspace/shared";
import { SectionShell, Toggle } from "./SettingsPrimitives";
import { OpenRouterModelCatalogDialog } from "./OpenRouterModelCatalogDialog";

export function ModelSettings({ settings, onChanged, embedded = false, embeddedPlain = false, providerFilter, connectionFilter }: { settings: AppSettings; onChanged?: () => void | Promise<void>; embedded?: boolean; embeddedPlain?: boolean; providerFilter?: LlmProviderId; connectionFilter?: string }) {
  const [installed, setInstalled] = useState<InstalledModelView[]>([]);
  const [connections, setConnections] = useState<Array<{ id: string; label: string }>>([]);
  const [reasoningModel, setReasoningModel] = useState<InstalledModelView | null>(null);
  const [reasoningConfig, setReasoningConfig] = useState<CustomModelReasoning>({ mode: "auto" });
  const [savingReasoning, setSavingReasoning] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!window.actspace.listInstalledModels) return;
    const [installedResult] = await Promise.all([
      window.actspace.listInstalledModels(),
    ]);
    setInstalled(installedResult.models);
  };
  useEffect(() => { void load(); void window.actspace.refreshPricingCatalog?.({ force: false }).catch(() => undefined); }, []);
  useEffect(() => { void window.actspace.getSettingsV4?.().then((snapshot) => { if (snapshot) setConnections(Object.values(snapshot.settings.models.connections).map((connection) => ({ id: connection.connectionId, label: connection.displayName ?? connection.connectionId }))); }); }, []);

  const toggleModel = async (modelKey: ModelKey, enabled: boolean) => {
    if (!window.actspace.updateModel) return;
    const result = await window.actspace.updateModel({ modelKey, enabled });
    if ("error" in result) setError(result.error.message);
    await load(); await onChanged?.();
  };

  const removeModel = async (modelKey: ModelKey) => {
    if (!window.actspace.removeModel) return;
    const result = await window.actspace.removeModel({ modelKey });
    if ("error" in result) setError(`${result.error.message}${result.error.references?.length ? `（${result.error.references.join("、")}）` : ""}`);
    await load(); await onChanged?.();
  };

  const updateCredential = async (modelKey: ModelKey, credentialId: string | null) => {
    if (!window.actspace.updateModel) return;
    setError(null);
    const result = await window.actspace.updateModel({ modelKey, credentialId });
    if ("error" in result) setError(result.error.message);
    await load(); await onChanged?.();
  };

  const handleModelAdded = async () => {
    await load();
    await onChanged?.();
  };

  if (!window.actspace?.listInstalledModels) return <SectionShell title="模型" description="仅桌面端可管理模型。"><div /></SectionShell>;

  const saveReasoning = async () => {
    if (!reasoningModel || !window.actspace.updateModel) return;
    setSavingReasoning(true); setError(null);
    try {
      const result = await window.actspace.updateModel({ modelKey: reasoningModel.definition.key, reasoningConfig });
      if ("error" in result) { setError(result.error.message); return; }
      setReasoningModel(null); await load(); await onChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败。"); }
    finally { setSavingReasoning(false); }
  };
  const content = <>
    {installed.filter((model) => model.definition.source === "custom" && (!connectionFilter || model.settings.connectionId === connectionFilter) && (!providerFilter || model.definition.provider === providerFilter)).map((model) => <button key={model.definition.key} type="button" className="my-2 block text-act-xs text-text-main hover:text-action" onClick={() => { setReasoningModel(model); setReasoningConfig(model.definition.reasoningConfig ?? { mode: "auto" }); setError(null); }}>配置推理能力：{model.definition.label}</button>)}
    {reasoningModel ? <div className="grid gap-3 py-3"><h4 className="text-act-sm font-semibold text-text-main">{reasoningModel.definition.label}</h4><CustomModelReasoningFields apiModel={reasoningModel.definition.apiModel} value={reasoningConfig} onChange={setReasoningConfig} /><div className="flex justify-end gap-3"><button type="button" disabled={savingReasoning} onClick={() => setReasoningModel(null)}>取消推理配置</button><button type="button" disabled={savingReasoning} onClick={() => void saveReasoning()}>保存推理配置</button></div></div> : null}
        {!embeddedPlain ? <div className="flex items-center justify-between gap-4"><div><p className="text-act-xs text-text-faint">停用后会立即从输入框与任务模型候选中移除。</p></div>{!embedded ? <div className="flex flex-wrap justify-end gap-2"><button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-act-md border border-line bg-surface px-3 text-act-xs font-semibold text-text-main transition-colors hover:border-line-strong hover:bg-hover-overlay active:scale-[0.98]" onClick={() => setCatalogOpen(true)}><Plus size={15} />从 OpenRouter 添加</button></div> : null}</div> : null}
        {error ? <p role="alert" className="mt-3 text-act-xs text-on-danger">{error}</p> : null}
        <div className={embeddedPlain ? "grid gap-5" : "mt-3 grid gap-5"}>
          {PROVIDER_IDS.filter((provider) => !providerFilter || provider === providerFilter).map((provider) => {
            const models = installed.filter((model) => model.definition.provider === provider && (connectionFilter
              ? model.settings.connectionId === connectionFilter
              : !providerFilter || !model.settings.connectionId || model.settings.connectionId === `${provider}:default`));
            if (!models.length) return null;
              return <section key={provider}>{embeddedPlain ? null : <div className="mb-2 flex items-center gap-2 text-act-sm font-medium text-text-main"><Boxes size={15} />{PROVIDER_REGISTRY[provider].label}<span className="text-act-xxs font-normal text-text-faint">{models.filter((model) => model.settings.enabled).length} / {models.length} 启用</span></div>}{embedded ? <ModelMultiSelector models={models} onChange={async (keys) => { const enabled = new Set(keys); await Promise.all(models.map((model) => toggleModel(model.definition.key, enabled.has(model.definition.key)))); }} /> : <div className="divide-y divide-line/70 overflow-hidden rounded-act-lg bg-surface-subtle">{models.map((model) => <ModelRow key={model.definition.key} model={model} provider={settings.providers[provider]} connections={connections.filter((connection) => connection.id.endsWith(":default") || connection.id.startsWith(`${provider}:`) || connection.id === model.settings.connectionId)} onToggle={toggleModel} onRemove={removeModel} onCredentialChange={updateCredential} onConnectionChange={async (key, connectionId) => { if (!window.actspace.updateModel) return; await window.actspace.updateModel({ modelKey: key, connectionId }); await load(); await onChanged?.(); }} />)}</div>}</section>;
          })}
        </div>
      </>;
  return (
    <>
      {embedded ? <section className={embeddedPlain ? "" : "mt-7 border-t border-line pt-6"}>{content}</section> : <SectionShell title="模型目录" description="在已连接的服务中发现、启用和管理模型。">{content}</SectionShell>}
      {catalogOpen ? (
        <OpenRouterModelCatalogDialog
          onClose={() => setCatalogOpen(false)}
          onAdded={handleModelAdded}
          onReloaded={handleModelAdded}
        />
      ) : null}
    </>
  );
}

function ModelMultiSelector({ models, onChange }: { models: InstalledModelView[]; onChange: (keys: ModelKey[]) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);
  const enabled = models.filter((model) => model.settings.enabled).map((model) => model.definition.key);
  const filtered = models.filter((model) => `${model.definition.label} ${model.definition.apiModel}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [open]);
  const labels = enabled.map((key) => models.find((model) => model.definition.key === key)?.settings.customLabel ?? models.find((model) => model.definition.key === key)?.definition.label ?? key);
  const allVisible = filtered.length > 0 && filtered.every((model) => enabled.includes(model.definition.key));
  const toggle = (key: ModelKey) => { const next = enabled.includes(key) ? enabled.filter((item) => item !== key) : [...enabled, key]; void onChange(next); };
  return <div ref={ref} className="relative"><button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label="选择启用模型" onClick={() => setOpen((value) => !value)} className="flex h-10 w-full items-center justify-between gap-3 rounded-act-md border border-line bg-surface px-3 text-left text-act-sm text-text-main hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"><span className="min-w-0 truncate">{labels.length ? labels.join(", ") : "选择模型"}</span><ChevronDown size={15} className="shrink-0 text-text-faint" aria-hidden="true" /></button>{open ? <div role="listbox" aria-label="启用模型" className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-act-md border border-line bg-surface shadow-act-float"><label className="relative block border-b border-line"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" aria-hidden="true" /><input autoFocus aria-label="搜索模型" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型" className="h-9 w-full bg-transparent pl-9 pr-3 text-act-xs text-text-main outline-none placeholder:text-text-faint" /></label><button type="button" role="option" aria-selected={allVisible} onClick={() => { const next = allVisible ? enabled.filter((key) => !filtered.some((model) => model.definition.key === key)) : Array.from(new Set([...enabled, ...filtered.map((model) => model.definition.key)])); void onChange(next); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-act-xs font-semibold text-text-main hover:bg-hover-overlay"><span className={`grid h-5 w-5 place-items-center rounded-act-sm border ${allVisible ? "border-action bg-action text-surface" : "border-line"}`}>{allVisible ? <Check size={13} aria-hidden="true" /> : null}</span>全部启用</button><div className="max-h-56 overflow-y-auto border-t border-line">{filtered.map((model) => { const checked = enabled.includes(model.definition.key); return <button key={model.definition.key} type="button" role="option" aria-selected={checked} onClick={() => toggle(model.definition.key)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-act-xs text-text-main hover:bg-hover-overlay"><span className={`grid h-5 w-5 place-items-center rounded-act-sm border ${checked ? "border-action bg-action text-surface" : "border-line"}`}>{checked ? <Check size={13} aria-hidden="true" /> : null}</span><span className="min-w-0 truncate">{model.settings.customLabel ?? model.definition.label}</span></button>; })}</div></div> : null}</div>;
}

function ModelRow({ model, provider, connections, onToggle, onRemove, onCredentialChange, onConnectionChange }: { model: InstalledModelView; provider?: ProviderSettingsView; connections: Array<{ id: string; label: string }>; onToggle: (key: ModelKey, enabled: boolean) => void; onRemove: (key: ModelKey) => void; onCredentialChange: (key: ModelKey, credentialId: string | null) => void; onConnectionChange: (key: ModelKey, connectionId: string | null) => void }) {
  const removable = model.definition.source === "provider-catalog" || model.definition.source === "custom";
  const credentials = provider?.additionalCredentials ?? [];
  const selectedCredential = credentials.find((credential) => credential.id === model.settings.credentialId);
  return <div className="flex min-h-[68px] items-center justify-between gap-4 px-3.5 py-3"><div className="min-w-0 flex-1"><div className="truncate text-act-sm font-medium text-text-main">{model.settings.customLabel ?? model.definition.label}</div><div className="mt-1 truncate font-mono text-act-xxs text-text-faint">{model.definition.apiModel}</div><div className="mt-1 text-act-xxs text-text-muted">{model.definition.contextWindow ? `${Math.round(model.definition.contextWindow / 1000)}K 上下文` : "上下文容量未知"} · {model.definition.family ?? model.definition.source} · {model.definition.capabilities.toolUse}</div>{connections.length > 0 ? <label className="mt-2 flex max-w-[340px] items-center gap-2"><span className="shrink-0 text-act-xxs font-medium text-text-muted">连接</span><select aria-label={`${model.definition.label} 连接`} value={model.settings.connectionId ?? `${model.definition.provider}:default`} onChange={(event) => onConnectionChange(model.definition.key, event.target.value)} className="h-8 min-w-0 flex-1 rounded-act-md border border-line bg-surface px-2 text-act-xxs text-text-main"><option value={`${model.definition.provider}:default`}>默认连接</option>{connections.filter((connection) => connection.id !== `${model.definition.provider}:default`).map((connection) => <option key={connection.id} value={connection.id}>{connection.label}</option>)}</select></label> : null}{credentials.length > 0 ? <label className="mt-2 flex max-w-[340px] items-center gap-2"><span className="shrink-0 text-act-xxs font-medium text-text-muted">调用 Key</span><select aria-label={`${model.definition.label} 调用 Key`} value={model.settings.credentialId ?? ""} onChange={(event) => onCredentialChange(model.definition.key, event.target.value || null)} className="h-8 min-w-0 flex-1 rounded-act-md border border-line bg-surface px-2 text-act-xxs text-text-main"><option value="" disabled={!provider?.hasApiKey}>默认 Key{provider?.hasApiKey ? "" : "（不可用）"}</option>{model.settings.credentialId && !selectedCredential ? <option value={model.settings.credentialId} disabled>已删除的 Key · 不可用</option> : null}{credentials.map((credential) => <option key={credential.id} value={credential.id} disabled={!credential.hasApiKey}>{credential.label}{credential.hasApiKey ? "" : "（不可用）"}</option>)}</select></label> : null}</div><div className="flex shrink-0 items-center gap-2">{removable ? <button type="button" aria-label={`删除 ${model.definition.label}`} className="grid h-10 w-10 place-items-center rounded-act-md text-text-faint hover:bg-danger-soft hover:text-on-danger" onClick={() => onRemove(model.definition.key)}><Trash2 size={16} /></button> : null}<Toggle checked={model.settings.enabled} onChange={(enabled) => onToggle(model.definition.key, enabled)} ariaLabel={`启用 ${model.definition.label}`} /></div></div>;
}

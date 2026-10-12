import { CustomModelReasoningFields } from "./CustomModelReasoningFields";
import type { CustomModelReasoning } from "@actspace/shared";
import { useEffect, useState } from "react";
import { Boxes, Plus, Trash2 } from "lucide-react";
import { PROVIDER_IDS, PROVIDER_REGISTRY, type AppSettings, type InstalledModelView, type ModelKey, type ProviderSettingsView, type LlmProviderId } from "@actspace/shared";
import { SectionShell, Toggle } from "./SettingsPrimitives";
import { Select } from "../ui/Select";
import { OpenRouterModelCatalogDialog } from "./OpenRouterModelCatalogDialog";
import { ModelMultiSelector } from "./ModelMultiSelector";
import { modelsApi } from "../../api/models";
import { settingsApi } from "../../api/settings";

export function ModelSettings({ settings, onChanged, embedded = false, embeddedPlain = false, providerFilter, connectionFilter }: { settings: AppSettings; onChanged?: () => void | Promise<void>; embedded?: boolean; embeddedPlain?: boolean; providerFilter?: LlmProviderId; connectionFilter?: string }) {
  const [installed, setInstalled] = useState<InstalledModelView[]>([]);
  const [connections, setConnections] = useState<Array<{ id: string; label: string }>>([]);
  const [reasoningModel, setReasoningModel] = useState<InstalledModelView | null>(null);
  const [reasoningConfig, setReasoningConfig] = useState<CustomModelReasoning>({ mode: "auto" });
  const [savingReasoning, setSavingReasoning] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [installedResult] = await Promise.all([
      modelsApi.listInstalled(),
    ]);
    setInstalled(installedResult.models);
  };
  useEffect(() => { void load(); void modelsApi.refreshPricingCatalog({ force: false }).catch(() => undefined); }, []);
  useEffect(() => { void settingsApi.getV4().then((snapshot) => { setConnections(Object.values(snapshot.settings.models.connections).map((connection) => ({ id: connection.connectionId, label: connection.displayName ?? connection.connectionId }))); }); }, []);

  const toggleModel = async (modelKey: ModelKey, enabled: boolean) => {
    const result = await modelsApi.update({ modelKey, enabled });
    if ("error" in result) setError(result.error.message);
    await load(); await onChanged?.();
  };

  const removeModel = async (modelKey: ModelKey) => {
    const result = await modelsApi.remove({ modelKey });
    if ("error" in result) setError(`${result.error.message}${result.error.references?.length ? `（${result.error.references.join("、")}）` : ""}`);
    await load(); await onChanged?.();
  };

  const updateCredential = async (modelKey: ModelKey, credentialId: string | null) => {
    setError(null);
    const result = await modelsApi.update({ modelKey, credentialId });
    if ("error" in result) setError(result.error.message);
    await load(); await onChanged?.();
  };

  const handleModelAdded = async () => {
    await load();
    await onChanged?.();
  };

  const saveReasoning = async () => {
    if (!reasoningModel) return;
    setSavingReasoning(true); setError(null);
    try {
      const result = await modelsApi.update({ modelKey: reasoningModel.definition.key, reasoningConfig });
      if ("error" in result) { setError(result.error.message); return; }
      setReasoningModel(null); await load(); await onChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败。"); }
    finally { setSavingReasoning(false); }
  };
  const content = <>
    {reasoningModel ? <div className="grid gap-3 py-3"><h4 className="text-act-sm font-semibold text-text-main">{reasoningModel.definition.label}</h4><CustomModelReasoningFields apiModel={reasoningModel.definition.apiModel} value={reasoningConfig} onChange={setReasoningConfig} /><div className="flex justify-end gap-3"><button type="button" disabled={savingReasoning} onClick={() => setReasoningModel(null)}>取消推理配置</button><button type="button" disabled={savingReasoning} onClick={() => void saveReasoning()}>保存推理配置</button></div></div> : null}
        {!embeddedPlain ? <div className="flex items-center justify-between gap-4"><div><p className="text-act-xs text-text-faint">停用后会立即从输入框与任务模型候选中移除。</p></div>{!embedded ? <div className="flex flex-wrap justify-end gap-2"><button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-act-md border border-line bg-surface px-3 text-act-xs font-semibold text-text-main transition-colors hover:border-line-strong hover:bg-hover-overlay active:scale-[0.98]" onClick={() => setCatalogOpen(true)}><Plus size={15} />从 OpenRouter 添加</button></div> : null}</div> : null}
        {error ? <p role="alert" className="mt-3 text-act-xs text-on-danger">{error}</p> : null}
        {/* minmax(0,1fr)：grid 子项默认 min-width:auto，单行截断的内容会把轨道撑宽。 */}
        <div className={embeddedPlain ? "grid grid-cols-[minmax(0,1fr)] gap-5" : "mt-3 grid grid-cols-[minmax(0,1fr)] gap-5"}>
          {PROVIDER_IDS.filter((provider) => !providerFilter || provider === providerFilter).map((provider) => {
            const models = installed.filter((model) => model.definition.provider === provider && (connectionFilter
              ? model.settings.connectionId === connectionFilter
              : !providerFilter || !model.settings.connectionId || model.settings.connectionId === `${provider}:default`));
            if (!models.length) return null;
              return <section key={provider}>{embeddedPlain ? null : <div className="mb-2 flex items-center gap-2 text-act-sm font-medium text-text-main"><Boxes size={15} />{PROVIDER_REGISTRY[provider].label}<span className="text-act-xxs font-normal text-text-faint">{models.filter((model) => model.settings.enabled).length} / {models.length} 启用</span></div>}{embedded ? <ModelMultiSelector models={models} onChange={async (keys) => { const enabled = new Set(keys); await Promise.all(models.map((model) => toggleModel(model.definition.key, enabled.has(model.definition.key)))); }} onReasoning={(model) => { setReasoningModel(model); setReasoningConfig(model.definition.reasoningConfig ?? { mode: "auto" }); setError(null); }} /> : <div className="divide-y divide-line/70 overflow-hidden rounded-act-lg bg-surface-subtle">{models.map((model) => <ModelRow key={model.definition.key} model={model} provider={settings.providers[provider]} connections={connections.filter((connection) => connection.id.endsWith(":default") || connection.id.startsWith(`${provider}:`) || connection.id === model.settings.connectionId)} onToggle={toggleModel} onRemove={removeModel} onCredentialChange={updateCredential} onConnectionChange={async (key, connectionId) => { await modelsApi.update({ modelKey: key, connectionId }); await load(); await onChanged?.(); }} onReasoning={model.definition.source === "custom" ? () => { setReasoningModel(model); setReasoningConfig(model.definition.reasoningConfig ?? { mode: "auto" }); setError(null); } : undefined} />)}</div>}</section>;
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

function ModelRow({ model, provider, connections, onToggle, onRemove, onCredentialChange, onConnectionChange, onReasoning }: { model: InstalledModelView; provider?: ProviderSettingsView; connections: Array<{ id: string; label: string }>; onToggle: (key: ModelKey, enabled: boolean) => void; onRemove: (key: ModelKey) => void; onCredentialChange: (key: ModelKey, credentialId: string | null) => void; onConnectionChange: (key: ModelKey, connectionId: string | null) => void; onReasoning?: () => void }) {
  const removable = model.definition.source === "provider-catalog" || model.definition.source === "custom";
  const credentials = provider?.additionalCredentials ?? [];
  const selectedCredential = credentials.find((credential) => credential.id === model.settings.credentialId);
  return <div className="flex min-h-[68px] items-center justify-between gap-4 px-3.5 py-3"><div className="min-w-0 flex-1"><div className="truncate text-act-sm font-medium text-text-main">{model.settings.customLabel ?? model.definition.label}</div><div className="mt-1 truncate font-mono text-act-xxs text-text-faint">{model.definition.apiModel}</div><div className="mt-1 text-act-xxs text-text-muted">{model.definition.contextWindow ? `${Math.round(model.definition.contextWindow / 1000)}K 上下文` : "上下文容量未知"} · {model.definition.family ?? model.definition.source} · {model.definition.capabilities.toolUse}</div>{connections.length > 0 ? <div className="mt-2 flex max-w-[340px] items-center gap-2"><span className="shrink-0 text-act-xxs font-medium text-text-muted">连接</span><Select ariaLabel={`${model.definition.label} 连接`} value={model.settings.connectionId ?? `${model.definition.provider}:default`} onValueChange={(value) => onConnectionChange(model.definition.key, value)} className="min-w-0 flex-1" options={[{ value: `${model.definition.provider}:default`, label: "默认连接" }, ...connections.filter((connection) => connection.id !== `${model.definition.provider}:default`).map((connection) => ({ value: connection.id, label: connection.label }))]} /></div> : null}{credentials.length > 0 ? <div className="mt-2 flex max-w-[340px] items-center gap-2"><span className="shrink-0 text-act-xxs font-medium text-text-muted">调用 Key</span><Select ariaLabel={`${model.definition.label} 调用 Key`} value={model.settings.credentialId ?? ""} onValueChange={(value) => onCredentialChange(model.definition.key, value || null)} className="min-w-0 flex-1" options={[{ value: "", label: `默认 Key${provider?.hasApiKey ? "" : "（不可用）"}`, disabled: !provider?.hasApiKey }, ...(model.settings.credentialId && !selectedCredential ? [{ value: model.settings.credentialId, label: "已删除的 Key · 不可用", disabled: true }] : []), ...credentials.map((credential) => ({ value: credential.id, label: `${credential.label}${credential.hasApiKey ? "" : "（不可用）"}`, disabled: !credential.hasApiKey }))]} /></div> : null}</div><div className="flex shrink-0 items-center gap-2">{onReasoning ? <button type="button" aria-label={`配置推理能力：${model.definition.label}`} className="text-act-xxs text-text-muted hover:text-action" onClick={onReasoning}>配置推理</button> : null}{removable ? <button type="button" aria-label={`删除 ${model.definition.label}`} className="grid h-10 w-10 place-items-center rounded-act-md text-text-faint hover:bg-danger-soft hover:text-on-danger" onClick={() => onRemove(model.definition.key)}><Trash2 size={16} /></button> : null}<Toggle checked={model.settings.enabled} onChange={(enabled) => onToggle(model.definition.key, enabled)} ariaLabel={`启用 ${model.definition.label}`} /></div></div>;
}

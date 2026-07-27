import { useEffect, useState } from "react";
import { Boxes, Plus, Trash2 } from "lucide-react";
import { PROVIDER_REGISTRY, type AppSettings, type InstalledModelView, type ModelKey, type ProviderSettingsView, type TaskModelSettings, type UsableModelView } from "@actspace/shared";
import { SectionShell, Toggle } from "./SettingsPrimitives";
import { ModelPurposeSelect } from "./ModelPurposeSelect";
import { DuckDingModelDialog } from "./DuckDingModelDialog";
import { OpenRouterModelCatalogDialog } from "./OpenRouterModelCatalogDialog";

const EMPTY_TASK_MODELS: TaskModelSettings = { defaultChatModel: null, utilityModel: null, exploreModel: null };

export function ModelSettings({ settings, onChanged }: { settings: AppSettings; onChanged?: () => void | Promise<void> }) {
  const [installed, setInstalled] = useState<InstalledModelView[]>([]);
  const [usable, setUsable] = useState<Record<"chat" | "utility" | "explore", UsableModelView[]>>({ chat: [], utility: [], explore: [] });
  const [taskModels, setTaskModels] = useState<TaskModelSettings>(settings.taskModels ?? EMPTY_TASK_MODELS);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [duckdingOpen, setDuckdingOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!window.actspace.listInstalledModels || !window.actspace.listUsableModels) return;
    const [installedResult, chat, utility, explore] = await Promise.all([
      window.actspace.listInstalledModels(),
      window.actspace.listUsableModels({ purpose: "chat" }),
      window.actspace.listUsableModels({ purpose: "utility" }),
      window.actspace.listUsableModels({ purpose: "explore" }),
    ]);
    setInstalled(installedResult.models);
    setUsable({ chat: chat.models, utility: utility.models, explore: explore.models });
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (settings.taskModels) setTaskModels(settings.taskModels); }, [settings.taskModels]);

  const updateTask = async (field: keyof TaskModelSettings, value: ModelKey | null) => {
    if (!window.actspace.updateTaskModels) return;
    setError(null);
    try {
      const result = await window.actspace.updateTaskModels({ [field]: value });
      setTaskModels(result.taskModels);
      await onChanged?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "任务模型保存失败。"); }
  };

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

  return (
    <>
      <SectionShell title="模型" description="控制进入主会话的模型，并为轻量任务与 Explore 选择已经连接、启用且能力匹配的模型。">
        <section className="overflow-hidden rounded-act-lg border border-line bg-surface shadow-act-soft">
          <ModelPurposeSelect label="默认会话模型" description="新会话与未显式选择模型时使用。不可用时会要求重新选择。" value={taskModels.defaultChatModel} models={usable.chat} onChange={(value) => void updateTask("defaultChatModel", value)} />
          <ModelPurposeSelect label="轻量任务模型" description="用于标题、工具输出摘要和上下文压缩；不可用时回退当前主模型。" value={taskModels.utilityModel} models={usable.utility} onChange={(value) => void updateTask("utilityModel", value)} />
          <ModelPurposeSelect label="Explore 模型" description="用于只读代码探索；不可用时回退当前主模型。" value={taskModels.exploreModel} models={usable.explore} onChange={(value) => void updateTask("exploreModel", value)} />
          <div className="flex min-h-[72px] items-center justify-between gap-5 px-4 py-3"><div><div className="text-[13px] font-semibold text-text-main">Kairos 模型</div><div className="mt-0.5 text-[12px] text-text-faint">{settings.kairosModelKey ?? "尚未配置"} · 在 Kairos 设置中维护唯一事实源。</div></div><span className="text-[12px] font-medium text-text-muted">前往 Kairos 设置</span></div>
        </section>
        <div className="mt-7 flex items-center justify-between gap-4"><div><h2 className="text-[15px] font-semibold text-text-main">已添加模型</h2><p className="mt-1 text-[12px] text-text-faint">停用后会立即从 Composer 与任务模型候选中移除。</p></div><div className="flex flex-wrap justify-end gap-2"><button type="button" className="inline-flex h-10 items-center gap-1.5 rounded-act-md border border-line bg-surface px-3.5 text-[12px] font-semibold text-text-main hover:border-line-strong" onClick={() => setDuckdingOpen(true)}><Plus size={16} />添加 DuckDing 模型</button><button type="button" className="inline-flex h-10 items-center gap-1.5 rounded-act-md border border-line bg-surface px-3.5 text-[12px] font-semibold text-text-main hover:border-line-strong" onClick={() => setCatalogOpen(true)}><Plus size={16} />从 OpenRouter 添加</button></div></div>
        {error ? <p role="alert" className="mt-3 text-[12px] text-on-danger">{error}</p> : null}
        <div className="mt-3 grid gap-5">
          {(["deepseek", "kimi", "openrouter", "duckding"] as const).map((provider) => {
            const models = installed.filter((model) => model.definition.provider === provider);
            if (!models.length) return null;
            return <section key={provider}><div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-text-main"><Boxes size={15} />{PROVIDER_REGISTRY[provider].label}<span className="text-[11px] font-normal text-text-faint">{models.filter((model) => model.settings.enabled).length} / {models.length} 启用</span></div><div className="overflow-hidden rounded-act-lg border border-line bg-surface">{models.map((model) => <ModelRow key={model.definition.key} model={model} provider={settings.providers[provider]} onToggle={toggleModel} onRemove={removeModel} onCredentialChange={updateCredential} />)}</div></section>;
          })}
        </div>
      </SectionShell>
      {catalogOpen ? (
        <OpenRouterModelCatalogDialog
          onClose={() => setCatalogOpen(false)}
          onAdded={handleModelAdded}
          onReloaded={handleModelAdded}
        />
      ) : null}
      {duckdingOpen ? <DuckDingModelDialog provider={settings.providers.duckding} onClose={() => setDuckdingOpen(false)} onAdded={handleModelAdded} /> : null}
    </>
  );
}

function ModelRow({ model, provider, onToggle, onRemove, onCredentialChange }: { model: InstalledModelView; provider?: ProviderSettingsView; onToggle: (key: ModelKey, enabled: boolean) => void; onRemove: (key: ModelKey) => void; onCredentialChange: (key: ModelKey, credentialId: string | null) => void }) {
  const removable = model.definition.source === "provider-catalog" || model.definition.source === "custom";
  const credentials = model.definition.provider === "duckding" ? provider?.additionalCredentials ?? [] : [];
  const selectedCredential = credentials.find((credential) => credential.id === model.settings.credentialId);
  const credentialMissing = Boolean(model.settings.credentialId && !selectedCredential);
  const multiplier = credentialMissing ? null : selectedCredential?.pricingMultiplier ?? provider?.defaultPricingMultiplier ?? 1;
  const effectivePricing = multiplier !== null && model.definition.pricing ? {
    input: model.definition.pricing.inputCacheMissPerMillion * multiplier,
    output: model.definition.pricing.outputPerMillion * multiplier,
  } : undefined;
  const credentialSummary = credentialMissing
    ? "Key 已缺失"
    : `${selectedCredential?.label ?? "默认 Key"} · ${multiplier}x`;
  return <div className="flex min-h-[74px] items-center justify-between gap-4 border-b border-line px-4 py-3 last:border-b-0"><div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold text-text-main">{model.settings.customLabel ?? model.definition.label}</div><div className="mt-1 truncate font-mono text-[11px] text-text-faint">{model.definition.apiModel}</div><div className="mt-1 text-[10px] text-text-muted">{model.definition.contextWindow ? `${Math.round(model.definition.contextWindow / 1000)}K context` : "context 未知"} · {model.definition.metadata?.source ?? model.definition.source} · {model.definition.capabilities.toolUse}</div>{model.definition.provider === "duckding" ? <div className={`mt-1 text-[10px] ${credentialMissing ? "text-on-danger" : "text-text-faint"}`}>{credentialSummary}{effectivePricing ? ` · 估算输入 $${formatModelPrice(effectivePricing.input)} / 输出 $${formatModelPrice(effectivePricing.output)} / 1M` : " · 价格未知"}</div> : null}{credentials.length > 0 ? <label className="mt-2 flex max-w-[340px] items-center gap-2"><span className="shrink-0 text-[10px] font-medium text-text-muted">调用 Key</span><select aria-label={`${model.definition.label} 调用 Key`} value={model.settings.credentialId ?? ""} onChange={(event) => onCredentialChange(model.definition.key, event.target.value || null)} className="h-8 min-w-0 flex-1 rounded-act-md border border-line bg-surface-subtle px-2 text-[11px] text-text-main outline-none focus:ring-2 focus:ring-[var(--act-color-focus-ring)]"><option value="" disabled={!provider?.hasApiKey}>默认 Key · {provider?.defaultPricingMultiplier ?? 1}x{provider?.hasApiKey ? "" : "（不可用）"}</option>{model.settings.credentialId && !selectedCredential ? <option value={model.settings.credentialId} disabled>已删除的 Key · 不可用</option> : null}{credentials.map((credential) => <option key={credential.id} value={credential.id} disabled={!credential.hasApiKey}>{credential.label} · {credential.pricingMultiplier}x{credential.hasApiKey ? "" : "（不可用）"}</option>)}</select></label> : null}</div><div className="flex shrink-0 items-center gap-2">{removable ? <button type="button" aria-label={`删除 ${model.definition.label}`} className="grid h-10 w-10 place-items-center rounded-act-md text-text-faint hover:bg-danger-soft hover:text-on-danger" onClick={() => onRemove(model.definition.key)}><Trash2 size={16} /></button> : null}<Toggle checked={model.settings.enabled} onChange={(enabled) => onToggle(model.definition.key, enabled)} ariaLabel={`启用 ${model.definition.label}`} /></div></div>;
}

function formatModelPrice(value: number): string {
  return String(Number(value.toFixed(6)));
}

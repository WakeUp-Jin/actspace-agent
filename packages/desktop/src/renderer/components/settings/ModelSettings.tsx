import { useEffect, useState } from "react";
import { Boxes, Plus, Trash2 } from "lucide-react";
import type { AppSettings, InstalledModelView, ModelKey, ModelPurpose, TaskModelSettings, UsableModelView } from "@actspace/shared";
import { SectionShell, Toggle } from "./SettingsPrimitives";
import { ModelPurposeSelect } from "./ModelPurposeSelect";
import { OpenRouterModelCatalogDialog } from "./OpenRouterModelCatalogDialog";

const EMPTY_TASK_MODELS: TaskModelSettings = { defaultChatModel: null, utilityModel: null, exploreModel: null };

export function ModelSettings({ settings, onChanged }: { settings: AppSettings; onChanged?: () => void | Promise<void> }) {
  const [installed, setInstalled] = useState<InstalledModelView[]>([]);
  const [usable, setUsable] = useState<Record<"chat" | "utility" | "explore", UsableModelView[]>>({ chat: [], utility: [], explore: [] });
  const [taskModels, setTaskModels] = useState<TaskModelSettings>(settings.taskModels ?? EMPTY_TASK_MODELS);
  const [catalogOpen, setCatalogOpen] = useState(false);
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
        <div className="mt-7 flex items-center justify-between"><div><h2 className="text-[15px] font-semibold text-text-main">已添加模型</h2><p className="mt-1 text-[12px] text-text-faint">停用后会立即从 Composer 与任务模型候选中移除。</p></div><button type="button" className="inline-flex h-10 items-center gap-1.5 rounded-act-md border border-line bg-surface px-3.5 text-[12px] font-semibold text-text-main hover:border-line-strong" onClick={() => setCatalogOpen(true)}><Plus size={16} />从 OpenRouter 添加</button></div>
        {error ? <p role="alert" className="mt-3 text-[12px] text-on-danger">{error}</p> : null}
        <div className="mt-3 grid gap-5">
          {(["deepseek", "kimi", "openrouter"] as const).map((provider) => {
            const models = installed.filter((model) => model.definition.provider === provider);
            if (!models.length) return null;
            return <section key={provider}><div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-text-main"><Boxes size={15} />{provider}<span className="text-[11px] font-normal text-text-faint">{models.filter((model) => model.settings.enabled).length} / {models.length} 启用</span></div><div className="overflow-hidden rounded-act-lg border border-line bg-surface">{models.map((model) => <ModelRow key={model.definition.key} model={model} onToggle={toggleModel} onRemove={removeModel} />)}</div></section>;
          })}
        </div>
      </SectionShell>
      {catalogOpen ? <OpenRouterModelCatalogDialog onClose={() => setCatalogOpen(false)} onAdded={load} /> : null}
    </>
  );
}

function ModelRow({ model, onToggle, onRemove }: { model: InstalledModelView; onToggle: (key: ModelKey, enabled: boolean) => void; onRemove: (key: ModelKey) => void }) {
  const removable = model.definition.source === "provider-catalog" || model.definition.source === "custom";
  return <div className="flex min-h-[74px] items-center justify-between gap-4 border-b border-line px-4 py-3 last:border-b-0"><div className="min-w-0"><div className="truncate text-[13px] font-semibold text-text-main">{model.settings.customLabel ?? model.definition.label}</div><div className="mt-1 truncate font-mono text-[11px] text-text-faint">{model.definition.apiModel}</div><div className="mt-1 text-[10px] text-text-muted">{model.definition.contextWindow ? `${Math.round(model.definition.contextWindow / 1000)}K context` : "context 未知"} · {model.definition.source} · {model.definition.capabilities.toolUse}</div></div><div className="flex shrink-0 items-center gap-2">{removable ? <button type="button" aria-label={`删除 ${model.definition.label}`} className="grid h-10 w-10 place-items-center rounded-act-md text-text-faint hover:bg-danger-soft hover:text-on-danger" onClick={() => onRemove(model.definition.key)}><Trash2 size={16} /></button> : null}<Toggle checked={model.settings.enabled} onChange={(enabled) => onToggle(model.definition.key, enabled)} ariaLabel={`启用 ${model.definition.label}`} /></div></div>;
}

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import type { InstalledModelView, SettingsV4ConnectionSettings } from "@actspace/shared";
import { Toggle } from "./SettingsPrimitives";

export function CustomConnectionModels({ connection, onConnectionChange, onChanged, onAdd, onEdit, revision }: {
  connection: SettingsV4ConnectionSettings;
  onConnectionChange: (connection: SettingsV4ConnectionSettings) => void;
  onChanged?: () => void | Promise<void>;
  onAdd: () => void;
  onEdit: (model: InstalledModelView) => void;
  revision?: number;
}) {
  const [models, setModels] = useState<InstalledModelView[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [installed, snapshot] = await Promise.all([window.actspace.listInstalledModels?.(), window.actspace.getSettingsV4?.()]);
    setModels((installed?.models ?? []).filter((model) => model.settings.connectionId === connection.connectionId));
    const nextConnection = snapshot?.settings.models.connections[connection.connectionId];
    if (nextConnection) onConnectionChange(nextConnection);
  }, [connection.connectionId, onConnectionChange]);

  useEffect(() => { void load(); }, [load, revision]);

  const mutate = async (operation: () => Promise<unknown>) => {
    setError(null);
    try { await operation(); await load(); await onChanged?.(); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "模型操作失败。"); }
  };

  return <div className="min-w-0">
    <div className="mb-3 flex items-center justify-between gap-4">
      <p className="text-act-xxs leading-relaxed text-text-faint">模型 ID、能力和价格均为此连接独立配置，不会从中转站自动拉取。</p>
      <button type="button" onClick={onAdd} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-act-md bg-action px-3 text-act-xs font-semibold text-on-action hover:bg-action-hover"><Plus size={14} />添加模型</button>
    </div>
    {error ? <p role="alert" className="mb-3 text-act-xs text-on-danger">{error}</p> : null}
    {models.length ? <div className="divide-y divide-line border-y border-line">
      {models.map((model) => {
        const isDefault = connection.defaultModel === model.definition.apiModel;
        return <div key={model.definition.key} className="flex items-start gap-4 px-3 py-4 max-[600px]:flex-col">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><p className="text-act-sm font-semibold text-text-main">{model.definition.label}</p>{isDefault ? <span className="rounded-act-pill bg-surface-subtle px-2 py-0.5 text-act-xxs font-medium text-text-muted">默认</span> : null}{model.definition.pricing ? <span className="rounded-act-pill bg-surface-subtle px-2 py-0.5 text-act-xxs font-medium text-text-muted">手动价格</span> : null}</div>
            <p className="mt-1 truncate font-mono text-act-xxs text-text-faint">{model.definition.apiModel}</p>
            <p className="mt-1 text-act-xxs leading-relaxed text-text-muted">{capacityLabel(model)} · {inputLabel(model)}{model.definition.pricing ? ` · ${pricingLabel(model)}` : " · 仅统计 Token"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1 max-[600px]:w-full">
            {!isDefault ? <button type="button" aria-label={`设 ${model.definition.label} 为默认模型`} onClick={() => void mutate(async () => { const result = await window.actspace.setCustomConnectionDefaultModel?.({ connectionId: connection.connectionId, modelKey: model.definition.key }); if (!result) throw new Error("当前版本不支持设置默认模型。"); if ("error" in result) throw new Error(result.error.message); })} className="h-9 rounded-act-md px-2.5 text-act-xxs font-semibold text-text-main hover:bg-hover-overlay">设为默认</button> : <CheckCircle2 size={16} className="mx-2 text-operational" aria-hidden="true" />}
            <button type="button" aria-label={`编辑 ${model.definition.label}`} onClick={() => onEdit(model)} className="grid h-9 w-9 place-items-center rounded-act-md text-text-muted hover:bg-hover-overlay hover:text-text-main"><Pencil size={15} /></button>
            <button type="button" aria-label={`删除 ${model.definition.label}`} onClick={() => void mutate(async () => { const result = await window.actspace.removeModel?.({ modelKey: model.definition.key }); if (!result) throw new Error("当前版本不支持删除模型。"); if ("error" in result) throw new Error(result.error.message); })} className="grid h-9 w-9 place-items-center rounded-act-md text-text-faint hover:bg-danger-soft hover:text-on-danger"><Trash2 size={15} /></button>
            <Toggle checked={model.settings.enabled} onChange={(enabled) => void mutate(async () => { const result = await window.actspace.updateModel?.({ modelKey: model.definition.key, enabled }); if (!result) throw new Error("当前版本不支持更新模型。"); if ("error" in result) throw new Error(result.error.message); })} ariaLabel={`启用 ${model.definition.label}`} />
          </div>
        </div>;
      })}
    </div> : <div className="rounded-act-md border border-dashed border-line px-4 py-6 text-center"><p className="text-act-sm font-medium text-text-main">这个连接还没有模型</p><p className="mt-1 text-act-xxs text-text-faint">添加模型后才能测试连接或在 Composer 中使用。</p></div>}
  </div>;
}

function capacityLabel(model: InstalledModelView): string {
  const context = model.definition.contextWindow ? `${formatNumber(model.definition.contextWindow)} 上下文` : "上下文未知";
  const output = model.definition.maxTokens ? `${formatNumber(model.definition.maxTokens)} 输出` : "输出上限未知";
  return `${context} · ${output}`;
}

function inputLabel(model: InstalledModelView): string {
  return model.definition.capabilities.input.includes("image") ? "文本和图片" : "仅文本";
}

function pricingLabel(model: InstalledModelView): string {
  const pricing = model.definition.pricing!;
  return `${pricing.currency} 输入 ${pricing.inputCacheMissPerMillion}/M，输出 ${pricing.outputPerMillion}/M，读缓存 ${pricing.inputCacheHitPerMillion}/M，写缓存 ${pricing.inputCacheWritePerMillion ?? 0}/M`;
}

function formatNumber(value: number): string {
  return value >= 1_000_000 ? `${value / 1_000_000}M` : value >= 1_000 ? `${Math.round(value / 1_000)}K` : String(value);
}

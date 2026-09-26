import { useState } from "react";
import type { CustomModelDraftInput, CustomModelReasoning, InstalledModelView, SettingsV4ConnectionSettings } from "@actspace/shared";
import { ArrowLeft } from "lucide-react";
import { CustomModelReasoningFields } from "./CustomModelReasoningFields";
import { ModelPricingFields, modelPricingFromDraft, pricingDraftFromModel, type ModelPricingDraft } from "./ModelPricingFields";
import { Toggle } from "./SettingsPrimitives";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";

export type CustomModelFormDraft = {
  apiModel: string;
  label: string;
  enabled: boolean;
  contextWindow: string;
  maxTokens: string;
  imageInput: boolean;
  reasoningConfig: CustomModelReasoning;
  pricingEnabled: boolean;
  pricing: ModelPricingDraft;
};

export function emptyCustomModelFormDraft(apiModel = ""): CustomModelFormDraft {
  return { apiModel, label: "", enabled: true, contextWindow: "", maxTokens: "", imageInput: false, reasoningConfig: { mode: "auto" }, pricingEnabled: false, pricing: pricingDraftFromModel() };
}

export function customModelFormDraftFromModel(model: InstalledModelView): CustomModelFormDraft {
  return {
    apiModel: model.definition.apiModel,
    label: model.definition.label,
    enabled: model.settings.enabled,
    contextWindow: model.definition.contextWindow ? String(model.definition.contextWindow) : "",
    maxTokens: model.definition.maxTokens ? String(model.definition.maxTokens) : "",
    imageInput: model.definition.capabilities.input.includes("image"),
    reasoningConfig: model.definition.reasoningConfig ?? { mode: "auto" },
    pricingEnabled: Boolean(model.definition.pricing),
    pricing: pricingDraftFromModel(model.definition.pricing),
  };
}

export function customModelInputFromDraft(draft: CustomModelFormDraft): CustomModelDraftInput {
  return {
    apiModel: draft.apiModel.trim(),
    label: draft.label.trim() || undefined,
    enabled: draft.enabled,
    contextWindow: parsePositiveInteger(draft.contextWindow, "上下文窗口"),
    maxTokens: parsePositiveInteger(draft.maxTokens, "最大输出 Token"),
    input: draft.imageInput ? ["text", "image"] : ["text"],
    reasoningConfig: draft.reasoningConfig,
    pricing: modelPricingFromDraft(draft.pricingEnabled, draft.pricing),
  };
}

export function CustomModelFields({ draft, onChange, apiModelLocked = false, autoFocusApiModel = true, showEnabled = true }: { draft: CustomModelFormDraft; onChange: (draft: CustomModelFormDraft) => void; apiModelLocked?: boolean; autoFocusApiModel?: boolean; showEnabled?: boolean }) {
  const inputClass = "h-10 w-full rounded-act-md border border-line bg-surface px-3 text-act-sm text-text-main outline-none focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/20 disabled:bg-surface-subtle disabled:text-text-faint";
  return <div className="grid gap-5">
    <label className="grid gap-1.5"><span className="text-act-xs font-semibold text-text-muted">API 模型 ID · 必填</span><input autoFocus={autoFocusApiModel && !apiModelLocked} disabled={apiModelLocked} value={draft.apiModel} onChange={(event) => onChange({ ...draft, apiModel: event.target.value })} placeholder="例如 claude-opus-5-5" className={inputClass} /></label>
    <label className="grid gap-1.5"><span className="text-act-xs font-semibold text-text-muted">显示名称</span><input value={draft.label} onChange={(event) => onChange({ ...draft, label: event.target.value })} placeholder="留空时使用 API 模型 ID" className={inputClass} /></label>
    <div className="grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
      <label className="grid gap-1.5"><span className="text-act-xs font-semibold text-text-muted">上下文窗口</span><input inputMode="numeric" value={draft.contextWindow} onChange={(event) => onChange({ ...draft, contextWindow: event.target.value })} placeholder="可留空" className={inputClass} /></label>
      <label className="grid gap-1.5"><span className="text-act-xs font-semibold text-text-muted">最大输出 Token</span><input inputMode="numeric" value={draft.maxTokens} onChange={(event) => onChange({ ...draft, maxTokens: event.target.value })} placeholder="可留空" className={inputClass} /></label>
    </div>
    <div className="grid gap-3 rounded-act-md border border-line p-4">
      {showEnabled ? <SwitchRow title="启用模型" description="启用后会出现在 Composer 和任务模型候选中。" checked={draft.enabled} onChange={(enabled) => onChange({ ...draft, enabled })} /> : null}
      <SwitchRow title="支持图片输入" description="声明中转站接受图片内容。" checked={draft.imageInput} onChange={(imageInput) => onChange({ ...draft, imageInput })} />
    </div>
    <CustomModelReasoningFields apiModel={draft.apiModel} value={draft.reasoningConfig} onChange={(reasoningConfig) => onChange({ ...draft, reasoningConfig })} />
    <ModelPricingFields enabled={draft.pricingEnabled} draft={draft.pricing} onEnabledChange={(pricingEnabled) => onChange({ ...draft, pricingEnabled })} onChange={(pricing) => onChange({ ...draft, pricing })} />
  </div>;
}

export function CustomModelForm({ connection, model, onBack, onSaved }: { connection: SettingsV4ConnectionSettings; model?: InstalledModelView; onBack: () => void; onSaved: () => void | Promise<void> }) {
  const [draft, setDraft] = useState(() => model ? customModelFormDraftFromModel(model) : emptyCustomModelFormDraft());
  const [setDefault, setSetDefault] = useState(!connection.defaultModel);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setSaving(true); setError(null);
    try {
      const input = customModelInputFromDraft(draft);
      const result = model
        ? await window.actspace.editCustomModel?.({ ...input, modelKey: model.definition.key })
        : await window.actspace.addCustomModel?.({ ...input, connectionId: connection.connectionId, setAsConnectionDefault: setDefault });
      if (!result) throw new Error("当前版本不支持自定义模型管理。");
      if ("error" in result) throw new Error(result.error.message);
      await onSaved();
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "保存模型失败。"); }
    finally { setSaving(false); }
  };
  return <div className="w-full" onKeyDown={(event) => { if (event.key === "Escape" && !saving) onBack(); }}>
    <div className="mb-7 flex items-start gap-3">
      <IconButton label="返回模型列表" size="md" onClick={onBack} className="mt-0.5"><ArrowLeft size={17} aria-hidden="true" /></IconButton>
      <div><h3 className="text-act-lg font-semibold tracking-tight text-text-main">{model ? "编辑模型" : "添加模型"}</h3><p className="mt-1 text-act-xs text-text-faint">{connection.displayName ?? connection.connectionId} · 模型和价格都由你手动维护</p></div>
    </div>
    <CustomModelFields draft={draft} onChange={setDraft} apiModelLocked={Boolean(model)} />
    {!model ? <div className="mt-5 rounded-act-md border border-line p-4"><SwitchRow title="设为连接默认模型" description="连接测试和未显式选择模型时使用此模型。" checked={setDefault} onChange={setSetDefault} /></div> : null}
    {error ? <p role="alert" className="mt-4 text-act-xs text-on-danger">{error}</p> : null}
    <div className="mt-6 flex justify-end gap-2"><Button variant="ghost" size="md" disabled={saving} onClick={onBack}>取消</Button><Button variant="primary" size="md" disabled={saving || !draft.apiModel.trim()} onClick={() => void save()}>{saving ? "保存中…" : "保存模型"}</Button></div>
  </div>;
}

function SwitchRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="flex items-start justify-between gap-4"><div><p className="text-act-xs font-medium text-text-main">{title}</p><p className="mt-1 text-act-xxs leading-relaxed text-text-faint">{description}</p></div><Toggle checked={checked} onChange={onChange} ariaLabel={title} /></div>;
}

function parsePositiveInteger(value: string, label: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 10_000_000) throw new Error(`${label}必须是正整数或留空。`);
  return parsed;
}

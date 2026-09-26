import { useState } from "react";
import {
  customModelDraftFromCatalog,
  findBuiltinCatalogModel,
  findReferenceCatalogModel,
  type CustomModelDraftInput,
  type CustomModelReasoning,
  type InstalledModelView,
  type ModelCatalogEntry,
  type SettingsV4ConnectionSettings,
} from "@actspace/shared";
import { CustomModelReasoningFields } from "./CustomModelReasoningFields";
import { ModelPricingFields, modelPricingFromDraft, pricingDraftFromModel, type ModelPricingDraft } from "./ModelPricingFields";
import { SettingGroup, SettingRow, SettingsInput, Toggle } from "./SettingsPrimitives";
import { Button } from "../ui/Button";
import { SetupFooter, SetupHeader, isOfficialAnthropic } from "./custom-connection-shared";

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

/** 旧的完整模型表单，只剩兼容预设（例如 Z.AI）创建连接时的「第一个模型」在用。 */
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
    <SettingGroup>
      <SettingRow title="手动价格" description="关闭时只统计 Token。" control={<Toggle checked={draft.pricingEnabled} ariaLabel="启用手动价格" onChange={(pricingEnabled) => onChange({ ...draft, pricingEnabled })} />} />
      {draft.pricingEnabled ? <ModelPricingFields draft={draft.pricing} onChange={(pricing) => onChange({ ...draft, pricing })} /> : null}
    </SettingGroup>
  </div>;
}

/**
 * 编辑自定义连接下的一个模型：名称、能力（默认跟随目录，可手动修改）、价格（默认跟随连接计费，可单独设置）。
 * 新增模型走连接详情里的行内添加，不再用这个页面。
 */
export function CustomModelForm({ connection, model, onBack, onSaved }: { connection: SettingsV4ConnectionSettings; model: InstalledModelView; onBack: () => void; onSaved: () => void | Promise<void> }) {
  const catalog = findBuiltinCatalogModel(model.definition.apiModel);
  const [draft, setDraft] = useState(() => customModelFormDraftFromModel(model));
  const [override, setOverride] = useState(() => !catalog || differsFromCatalog(draft, catalog));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const official = isOfficialAnthropic(connection);
  const billingMode = official ? "reference" : connection.billingMode ?? "manual";
  const summary = priceSummary(connection, model.definition.apiModel, official);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const input = customModelInputFromDraft(draft);
      // 关闭「手动修改」时能力回到目录值，推理回到自动匹配。
      const capability = override ? input : { ...input, ...customModelDraftFromCatalog(input.apiModel), label: input.label, enabled: input.enabled, pricing: input.pricing };
      const result = await window.actspace.editCustomModel?.({ ...capability, modelKey: model.definition.key });
      if (!result) throw new Error("当前版本不支持自定义模型管理。");
      if ("error" in result) throw new Error(result.error.message);
      await onSaved();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "保存模型失败。");
      setSaving(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-8" onKeyDown={(event) => { if (event.key === "Escape" && !saving) onBack(); }}>
      <SetupHeader backLabel={connection.displayName ?? connection.connectionId} onBack={onBack} title={draft.label.trim() || model.definition.apiModel} subtitle={<span className="font-mono">{model.definition.apiModel}</span>} />

      <SettingGroup>
        <SettingRow title="显示名称" control={<SettingsInput aria-label="显示名称" placeholder={model.definition.apiModel} value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />} />
      </SettingGroup>

      <SettingGroup title="能力">
        <SettingRow
          title={catalog ? capabilitySummary(catalog) : "能力未知，请手动填写"}
          description={catalog ? "已从模型目录匹配" : undefined}
          control={catalog ? <><span className="text-act-xs text-text-muted">手动修改</span><Toggle checked={override} ariaLabel="手动修改能力" onChange={setOverride} /></> : undefined}
        />
        {override ? (
          <>
            <SettingRow indent tight title="上下文窗口" control={<SettingsInput width="sm" numeric inputMode="numeric" aria-label="上下文窗口" placeholder="200000" value={draft.contextWindow} onChange={(event) => setDraft({ ...draft, contextWindow: event.target.value })} />} />
            <SettingRow indent tight title="最大输出" control={<SettingsInput width="sm" numeric inputMode="numeric" aria-label="最大输出" placeholder="64000" value={draft.maxTokens} onChange={(event) => setDraft({ ...draft, maxTokens: event.target.value })} />} />
            <SettingRow indent tight title="图片输入" control={<Toggle checked={draft.imageInput} ariaLabel="图片输入" onChange={(imageInput) => setDraft({ ...draft, imageInput })} />} />
            <div className="py-3 pl-9 pr-4">
              <CustomModelReasoningFields apiModel={draft.apiModel} value={draft.reasoningConfig} onChange={(reasoningConfig) => setDraft({ ...draft, reasoningConfig })} />
            </div>
          </>
        ) : null}
      </SettingGroup>

      <SettingGroup title="价格">
        {/* 「只统计 Token」时模型上的单价不参与计费，不提供单独设置。 */}
        <SettingRow
          title={billingMode !== "token" && draft.pricingEnabled ? "单独设置单价" : summary.title}
          description={billingMode !== "token" && draft.pricingEnabled ? undefined : summary.description}
          control={billingMode === "token" || (official && !draft.pricingEnabled) ? undefined : <><span className="text-act-xs text-text-muted">单独设置</span><Toggle checked={draft.pricingEnabled} ariaLabel="单独设置单价" onChange={(pricingEnabled) => setDraft({ ...draft, pricingEnabled })} /></>}
        />
        {draft.pricingEnabled && billingMode !== "token" ? <ModelPricingFields draft={draft.pricing} onChange={(pricing) => setDraft({ ...draft, pricing })} /> : null}
      </SettingGroup>

      {error ? <p role="alert" className="-mt-4 text-act-xs text-on-danger">{error}</p> : null}
      <SetupFooter>
        <Button variant="ghost" size="md" disabled={saving} onClick={onBack}>取消</Button>
        <Button variant="primary" size="md" busy={saving} disabled={saving} onClick={() => void save()}>{saving ? "保存中…" : "保存"}</Button>
      </SetupFooter>
    </div>
  );
}

function capabilitySummary(entry: ModelCatalogEntry): string {
  return [
    entry.contextWindow ? `${formatNumber(entry.contextWindow)} 上下文` : null,
    entry.maxOutput ? `${formatNumber(entry.maxOutput)} 输出` : null,
    entry.input.includes("image") ? "图片" : null,
    entry.reasoning ? "推理" : null,
  ].filter(Boolean).join(" · ");
}

function differsFromCatalog(draft: CustomModelFormDraft, entry: ModelCatalogEntry): boolean {
  const fromCatalog = customModelDraftFromCatalog(entry.apiModel);
  return draft.contextWindow !== (fromCatalog.contextWindow ? String(fromCatalog.contextWindow) : "")
    || draft.maxTokens !== (fromCatalog.maxTokens ? String(fromCatalog.maxTokens) : "")
    || draft.imageInput !== (fromCatalog.input.length > 1)
    || draft.reasoningConfig.mode !== "auto"
    || draft.reasoningConfig.referenceModel !== undefined;
}

/** 不单独设置单价时，这个模型按连接的计费方式怎么算。 */
function priceSummary(connection: SettingsV4ConnectionSettings, apiModel: string, official: boolean): { title: string; description?: string } {
  const billingMode = official ? "reference" : connection.billingMode ?? "manual";
  if (billingMode === "token") return { title: "只统计 Token" };
  if (billingMode === "manual") return { title: "未设置单价，只统计 Token" };
  const entry = findReferenceCatalogModel(apiModel, connection.protocol ?? "openai-completions");
  if (!entry) return { title: "未匹配官方价，只统计 Token" };
  const multiplier = official ? 1 : connection.defaultPricingMultiplier ?? 1;
  const symbol = entry.currency === "CNY" ? "¥" : "$";
  const money = (value: number) => `${symbol}${(value * multiplier).toFixed(2)}`;
  return {
    title: `输入 ${money(entry.rates.input)} · 输出 ${money(entry.rates.output)} · 每百万 Token`,
    description: official ? undefined : `官方价 × ${multiplier.toFixed(2)}`,
  };
}

function SwitchRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="flex items-start justify-between gap-4"><div><p className="text-act-xs font-medium text-text-main">{title}</p><p className="mt-1 text-act-xxs leading-relaxed text-text-faint">{description}</p></div><Toggle checked={checked} onChange={onChange} ariaLabel={title} /></div>;
}

function formatNumber(value: number): string {
  return value >= 1_000_000 ? `${value / 1_000_000}M` : value >= 1_000 ? `${Math.round(value / 1_000)}K` : String(value);
}

function parsePositiveInteger(value: string, label: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 10_000_000) throw new Error(`${label}必须是正整数或留空。`);
  return parsed;
}

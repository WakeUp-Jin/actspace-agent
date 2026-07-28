import { useMemo, useState, type ReactNode } from "react";
import { Code2, Sparkles, X } from "lucide-react";
import {
  DUCKCODING_MODEL_CATALOG,
  type DuckCodingCatalogModel,
  type ModelReasoningEffort,
  type ProviderSettingsView,
} from "@actspace/shared";
import { useDialogFocusTrap } from "./useDialogFocusTrap";

type AddMode = "catalog" | "manual";

export function DuckCodingModelDialog({
  provider,
  onClose,
  onAdded,
}: {
  provider?: ProviderSettingsView;
  onClose: () => void;
  onAdded: () => void | Promise<void>;
}) {
  const [mode, setMode] = useState<AddMode>("catalog");
  const [catalogModelId, setCatalogModelId] = useState(DUCKCODING_MODEL_CATALOG[0]?.id ?? "");
  const [manualApiModel, setManualApiModel] = useState("");
  const [manualLabel, setManualLabel] = useState("");
  const selected = useMemo(
    () => DUCKCODING_MODEL_CATALOG.find((model) => model.id === catalogModelId),
    [catalogModelId],
  );
  const [contextWindow, setContextWindow] = useState(String(selected?.contextWindow ?? 255_000));
  const [maxTokens, setMaxTokens] = useState(selected?.maxTokens ? String(selected.maxTokens) : "");
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { dialogRef, trapTabKey } = useDialogFocusTrap();
  const credentials = provider?.additionalCredentials ?? [];

  const apiModel = mode === "catalog" ? selected?.apiModel ?? "" : manualApiModel.trim();
  const credentialAvailable = credentialId
    ? credentials.some((credential) => credential.id === credentialId && credential.hasApiKey)
    : provider?.hasApiKey !== false;
  const contextValue = Number(contextWindow);
  const maxTokensValue = maxTokens.trim() ? Number(maxTokens) : null;
  const limitsValid = isValidTokenLimit(contextValue) && (maxTokensValue === null || isValidTokenLimit(maxTokensValue));

  const chooseCatalog = (model: DuckCodingCatalogModel) => {
    setMode("catalog");
    setCatalogModelId(model.id);
    setContextWindow(String(model.contextWindow));
    setMaxTokens(model.maxTokens ? String(model.maxTokens) : "");
    setError(null);
  };

  const chooseManual = () => {
    setMode("manual");
    setContextWindow("255000");
    setMaxTokens("");
    setError(null);
  };

  const save = async () => {
    if (!window.actspace.addModel || !limitsValid) return;
    setSaving(true);
    setError(null);
    try {
      const mutation = await window.actspace.addModel({
        provider: "duckcoding",
        apiModel,
        ...(mode === "catalog" && selected && { catalogModelId: selected.id }),
        ...(mode === "manual" && manualLabel.trim() && { label: manualLabel.trim() }),
        contextWindow: contextValue,
        maxTokens: maxTokensValue,
        credentialId,
      });
      if ("error" in mutation) {
        setError(mutation.error.message);
        return;
      }
      await onAdded();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-[160] grid place-items-center bg-scrim px-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="duckcoding-model-title"
      onKeyDown={(event) => { if (event.key === "Escape") onClose(); else trapTabKey(event); }}
    >
      <div className="max-h-[88vh] w-full max-w-[700px] overflow-y-auto rounded-act-xl border border-line bg-surface p-5 shadow-act-float">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="duckcoding-model-title" className="text-[18px] font-semibold text-text-main">添加 DuckCoding 模型</h2>
            <p className="mt-1 text-[12px] text-text-faint">模型名按 DuckCoding 实际路由发送；Codex 的思考强度通过不同模型名切换。</p>
          </div>
          <button type="button" aria-label="关闭 DuckCoding 模型" className="grid h-10 w-10 place-items-center rounded-act-md text-text-faint hover:bg-surface-subtle" onClick={onClose}><X size={18} /></button>
        </div>

        <section className="mt-5">
          <h3 className="text-[12px] font-semibold text-text-muted">DuckCoding 本地模型档案</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {DUCKCODING_MODEL_CATALOG.map((model) => (
              <button
                key={model.id}
                type="button"
                aria-pressed={mode === "catalog" && catalogModelId === model.id}
                onClick={() => chooseCatalog(model)}
                className={`rounded-act-lg border p-3 text-left transition-colors ${mode === "catalog" && catalogModelId === model.id ? "border-line-strong bg-selected" : "border-line bg-surface-subtle hover:border-line-strong"}`}
              >
                <span className="flex items-start gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-act-md bg-surface text-text-main">{model.family === "codex" ? <Code2 size={16} /> : <Sparkles size={16} />}</span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-text-main">{model.label}</span>
                    <span className="mt-0.5 block font-mono text-[10px] text-text-faint">{model.apiModel}</span>
                    <span className="mt-1 block text-[10px] text-text-muted">{model.family} · {formatTokenLimit(model.contextWindow)} context · tools {model.capabilities.toolUse}</span>
                  </span>
                </span>
              </button>
            ))}
            <button
              type="button"
              aria-pressed={mode === "manual"}
              onClick={chooseManual}
              className={`rounded-act-lg border p-3 text-left transition-colors ${mode === "manual" ? "border-line-strong bg-selected" : "border-line bg-surface-subtle hover:border-line-strong"}`}
            >
              <span className="block text-[13px] font-semibold text-text-main">自定义模型</span>
              <span className="mt-1 block text-[10px] leading-relaxed text-text-faint">填写 DuckCoding 接口接受的精确模型名；不会自动添加 OpenAI、Azure 或其他前缀。</span>
            </button>
          </div>
        </section>

        {mode === "catalog" && selected ? <VariantSummary model={selected} /> : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="API 模型名">
              <input autoFocus aria-label="DuckCoding API 模型名" value={manualApiModel} onChange={(event) => setManualApiModel(event.target.value)} placeholder="例如 grok-4.5" className="h-10 w-full rounded-act-md border border-line bg-surface-subtle px-3 font-mono text-[13px] text-text-main outline-none focus:ring-2 focus:ring-[var(--act-color-focus-ring)]" />
            </Field>
            <Field label="显示名称（可选）">
              <input aria-label="DuckCoding 模型显示名称" value={manualLabel} onChange={(event) => setManualLabel(event.target.value)} placeholder="例如 Grok 4.5" className="h-10 w-full rounded-act-md border border-line bg-surface-subtle px-3 text-[13px] text-text-main outline-none focus:ring-2 focus:ring-[var(--act-color-focus-ring)]" />
            </Field>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="最大上下文（tokens）" helper="会用于上下文预算与压缩，不只是显示信息。">
            <input aria-label="DuckCoding 最大上下文" type="number" min="1024" max="10000000" step="1" value={contextWindow} onChange={(event) => setContextWindow(event.target.value)} className="h-10 w-full rounded-act-md border border-line bg-surface-subtle px-3 text-[13px] text-text-main outline-none focus:ring-2 focus:ring-[var(--act-color-focus-ring)]" />
          </Field>
          <Field label="最大输出（可选）" helper="留空时不额外覆盖模型输出限制。">
            <input aria-label="DuckCoding 最大输出" type="number" min="1024" max="10000000" step="1" value={maxTokens} onChange={(event) => setMaxTokens(event.target.value)} placeholder="未指定" className="h-10 w-full rounded-act-md border border-line bg-surface-subtle px-3 text-[13px] text-text-main outline-none focus:ring-2 focus:ring-[var(--act-color-focus-ring)]" />
          </Field>
        </div>

        {credentials.length > 0 ? (
          <Field label="调用 Key" helper="这里只能选择供应商页已经保存的 Key。" className="mt-4">
            <select aria-label="DuckCoding 模型调用 Key" value={credentialId ?? ""} onChange={(event) => setCredentialId(event.target.value || null)} className="h-10 w-full rounded-act-md border border-line bg-surface-subtle px-3 text-[13px] text-text-main outline-none focus:ring-2 focus:ring-[var(--act-color-focus-ring)]">
              <option value="" disabled={!provider?.hasApiKey}>默认 Key · {provider?.defaultPricingMultiplier ?? 1}x{provider?.hasApiKey ? "" : "（未配置）"}</option>
              {credentials.map((credential) => <option key={credential.id} value={credential.id} disabled={!credential.hasApiKey}>{credential.label} · {credential.pricingMultiplier}x{credential.hasApiKey ? "" : "（不可用）"}</option>)}
            </select>
          </Field>
        ) : null}

        {!limitsValid ? <p role="alert" className="mt-3 text-[12px] text-on-danger">上下文和输出限制必须是 1,024 到 10,000,000 之间的整数。</p> : null}
        {error ? <p role="alert" className="mt-3 text-[12px] text-on-danger">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-act-md border border-line px-4 text-[13px] font-semibold text-text-main hover:bg-surface-subtle">取消</button>
          <button type="button" disabled={saving || !apiModel || !credentialAvailable || !limitsValid} onClick={() => void save()} className="h-10 rounded-act-md bg-text-main px-4 text-[13px] font-semibold text-surface disabled:opacity-40">{saving ? "添加中…" : "添加模型"}</button>
        </div>
      </div>
    </div>
  );
}

function VariantSummary({ model }: { model: DuckCodingCatalogModel }) {
  const variants = Object.entries(model.requestModelByReasoningEffort ?? {});
  return (
    <div className="mt-4 rounded-act-lg border border-line bg-surface-subtle p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-semibold text-text-main">实际请求模型</span>
        <span className="rounded-act-pill bg-surface px-2 py-1 text-[10px] text-text-faint">供应商 DuckCoding</span>
      </div>
      {variants.length > 0 ? (
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {variants.map(([effort, apiModel]) => <div key={effort} className="flex items-center justify-between gap-2 rounded-act-md bg-surface px-2.5 py-2 text-[11px]"><span className="font-medium text-text-muted">{duckCodingEffortLabel(effort as ModelReasoningEffort)}</span><code className="truncate text-text-main">{apiModel}</code></div>)}
        </div>
      ) : <p className="mt-2 font-mono text-[11px] text-text-main">{model.apiModel}</p>}
      <p className="mt-2 text-[10px] text-text-faint">DuckCoding 不接收 reasoning effort 属性；Composer 选择强度后会改用这里对应的模型名称。</p>
    </div>
  );
}

function Field({ label, helper, className = "", children }: { label: string; helper?: string; className?: string; children: ReactNode }) {
  return <label className={`grid gap-1.5 ${className}`}><span className="text-[12px] font-semibold text-text-muted">{label}</span>{children}{helper ? <span className="text-[10px] leading-relaxed text-text-faint">{helper}</span> : null}</label>;
}

function isValidTokenLimit(value: number): boolean {
  return Number.isInteger(value) && value >= 1_024 && value <= 10_000_000;
}

function formatTokenLimit(value: number): string {
  return value >= 1_000_000 ? `${Number((value / 1_000_000).toFixed(2))}M` : `${Math.round(value / 1_000)}K`;
}

function duckCodingEffortLabel(effort: ModelReasoningEffort): string {
  if (effort === "low") return "Light";
  if (effort === "medium") return "Medium";
  if (effort === "high") return "High";
  if (effort === "xhigh") return "Extra High";
  if (effort === "ultra") return "Ultra";
  return effort;
}

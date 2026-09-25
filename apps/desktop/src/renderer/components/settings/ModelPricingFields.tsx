import type { ModelPricing } from "@actspace/shared";
import { Toggle } from "./SettingsPrimitives";

export type ModelPricingDraft = {
  currency: ModelPricing["currency"];
  input: string;
  output: string;
  cacheRead: string;
  cacheWrite: string;
};

export const EMPTY_MODEL_PRICING: ModelPricingDraft = {
  currency: "USD",
  input: "",
  output: "",
  cacheRead: "",
  cacheWrite: "",
};

export function pricingDraftFromModel(pricing?: ModelPricing): ModelPricingDraft {
  if (!pricing) return { ...EMPTY_MODEL_PRICING };
  return {
    currency: pricing.currency,
    input: String(pricing.inputCacheMissPerMillion),
    output: String(pricing.outputPerMillion),
    cacheRead: String(pricing.inputCacheHitPerMillion),
    cacheWrite: String(pricing.inputCacheWritePerMillion ?? 0),
  };
}

export function modelPricingFromDraft(enabled: boolean, draft: ModelPricingDraft): ModelPricing | null {
  if (!enabled) return null;
  const inputCacheMissPerMillion = parseRate(draft.input, "标准输入");
  const outputPerMillion = parseRate(draft.output, "输出");
  const inputCacheHitPerMillion = parseRate(draft.cacheRead, "缓存读取");
  const inputCacheWritePerMillion = parseRate(draft.cacheWrite, "缓存写入");
  return { currency: draft.currency, inputCacheMissPerMillion, outputPerMillion, inputCacheHitPerMillion, inputCacheWritePerMillion };
}

export function ModelPricingFields({ enabled, draft, onEnabledChange, onChange }: {
  enabled: boolean;
  draft: ModelPricingDraft;
  onEnabledChange: (enabled: boolean) => void;
  onChange: (draft: ModelPricingDraft) => void;
}) {
  const inputClass = "h-9 w-full rounded-act-md border border-line bg-surface px-3 text-[13px] text-text-main outline-none focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/20";
  return (
    <fieldset className="grid gap-4 rounded-act-md border border-line p-4">
      <legend className="px-1 text-[13px] font-semibold text-text-main">手动价格</legend>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-medium text-text-main">记录此中转站的实际单价</p>
          <p className="mt-1 text-[11px] leading-relaxed text-text-faint">关闭时只统计 Token，不估算金额。所有价格均为每百万 Token。</p>
        </div>
        <Toggle checked={enabled} onChange={onEnabledChange} ariaLabel="启用手动价格" />
      </div>
      {enabled ? (
        <div className="grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
          <label className="grid gap-1.5 text-[12px] font-medium text-text-muted">币种
            <select value={draft.currency} onChange={(event) => onChange({ ...draft, currency: event.target.value as ModelPricing["currency"] })} className={inputClass}>
              <option value="USD">USD</option>
              <option value="CNY">CNY</option>
            </select>
          </label>
          <PriceInput label="标准输入" value={draft.input} onChange={(input) => onChange({ ...draft, input })} className={inputClass} />
          <PriceInput label="输出" value={draft.output} onChange={(output) => onChange({ ...draft, output })} className={inputClass} />
          <PriceInput label="缓存读取" value={draft.cacheRead} onChange={(cacheRead) => onChange({ ...draft, cacheRead })} className={inputClass} />
          <PriceInput label="缓存写入" value={draft.cacheWrite} onChange={(cacheWrite) => onChange({ ...draft, cacheWrite })} className={inputClass} />
        </div>
      ) : null}
    </fieldset>
  );
}

function PriceInput({ label, value, onChange, className }: { label: string; value: string; onChange: (value: string) => void; className: string }) {
  return <label className="grid gap-1.5 text-[12px] font-medium text-text-muted">{label}<input inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} placeholder="0.00" className={className} /></label>;
}

function parseRate(value: string, label: string): number {
  if (!value.trim()) throw new Error(`请填写${label}价格。`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) throw new Error(`${label}价格必须是 0 到 1000000 之间的数字。`);
  return parsed;
}

import type { ModelPricing } from "@actspace/shared";
import { SettingRow, SettingsInput, SettingsSelect } from "./SettingsPrimitives";

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
  const inputCacheMissPerMillion = parseRate(draft.input, "输入");
  const outputPerMillion = parseRate(draft.output, "输出");
  const inputCacheHitPerMillion = parseRate(draft.cacheRead, "缓存读取");
  const inputCacheWritePerMillion = parseRate(draft.cacheWrite, "缓存写入");
  return { currency: draft.currency, inputCacheMissPerMillion, outputPerMillion, inputCacheHitPerMillion, inputCacheWritePerMillion };
}

const RATE_FIELDS = [
  { key: "input", label: "输入" },
  { key: "output", label: "输出" },
  { key: "cacheRead", label: "缓存读取" },
  { key: "cacheWrite", label: "缓存写入" },
] as const;

/** 币种 + 四项单价，每项一行；放在 SettingGroup 里使用。 */
export function ModelPricingFields({ draft, onChange }: { draft: ModelPricingDraft; onChange: (draft: ModelPricingDraft) => void }) {
  const unit = `${draft.currency === "CNY" ? "¥" : "$"} / 百万`;
  return (
    <>
      <SettingRow
        indent
        tight
        title="币种"
        control={<SettingsSelect size="sm" ariaLabel="币种" value={draft.currency} options={[{ value: "USD", label: "USD" }, { value: "CNY", label: "CNY" }]} onChange={(currency) => onChange({ ...draft, currency: currency as ModelPricing["currency"] })} />}
      />
      {RATE_FIELDS.map((field) => (
        <SettingRow
          key={field.key}
          indent
          tight
          title={field.label}
          control={<>
            <span className="text-act-xs text-text-faint">{unit}</span>
            <SettingsInput width="sm" numeric inputMode="decimal" aria-label={`${field.label}单价`} placeholder="0.00" value={draft[field.key]} onChange={(event) => onChange({ ...draft, [field.key]: event.target.value })} />
          </>}
        />
      ))}
    </>
  );
}

function parseRate(value: string, label: string): number {
  if (!value.trim()) throw new Error(`请填写${label}价格。`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) throw new Error(`${label}价格必须是 0 到 1000000 之间的数字。`);
  return parsed;
}

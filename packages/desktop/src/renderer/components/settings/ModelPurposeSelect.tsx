import type { ModelKey, UsableModelView } from "@actspace/shared";
import { formatSelectedModelLabel, groupModelsByProvider } from "../../model-option-groups";

export function ModelPurposeSelect({ label, description, value, models, onChange, disabled = false }: { label: string; description: string; value: ModelKey | null; models: UsableModelView[]; onChange: (value: ModelKey | null) => void; disabled?: boolean }) {
  const selectedAvailable = value ? models.some((model) => model.key === value) : true;
  const modelGroups = groupModelsByProvider(models);
  return (
    <label className="flex min-h-[72px] items-center justify-between gap-5 border-b border-line px-4 py-3 last:border-b-0">
      <span className="min-w-0"><span className="block text-[13px] font-semibold text-text-main">{label}</span><span className="mt-0.5 block text-[12px] leading-relaxed text-text-faint">{description}</span>{value && !selectedAvailable ? <span className="mt-1 block text-[11px] text-on-danger">当前模型不可用；运行时会按该任务的回退规则处理。</span> : null}</span>
      <select aria-label={label} value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value ? event.target.value as ModelKey : null)} className="h-10 min-w-[260px] rounded-act-md border border-line bg-surface px-3 text-[12px] text-text-main outline-none focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/20 disabled:cursor-not-allowed disabled:opacity-60">
        <option value="">未配置</option>
        {value && !selectedAvailable ? <option value={value} disabled>{value}（不可用）</option> : null}
        {modelGroups.map((group) => (
          <optgroup key={group.provider} label={group.label}>
            {group.models.map((model) => (
              <option key={model.key} value={model.key}>
                {formatSelectedModelLabel(model, models)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

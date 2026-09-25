import type { ModelKey, UsableModelView } from "@actspace/shared";
import { formatSelectedModelLabel, groupModelsByProvider } from "../../model-option-groups";
import { SettingRow, SettingsSelect, type SelectOption } from "./SettingsPrimitives";

export function ModelPurposeSelect({
  label,
  description,
  value,
  models,
  onChange,
  disabled = false,
  emptyLabel = "未配置",
}: {
  label: string;
  description: string;
  value: ModelKey | null;
  models: UsableModelView[];
  onChange: (value: ModelKey | null) => void;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  const selectedAvailable = value ? models.some((model) => model.key === value) : true;
  const options: SelectOption[] = [
    { value: "", label: emptyLabel },
    ...(value && !selectedAvailable ? [{ value, label: `${value}（不可用）`, disabled: true }] : []),
    ...groupModelsByProvider(models).flatMap((group) => group.models.map((model) => ({
      value: model.key,
      label: formatSelectedModelLabel(model, models),
      group: group.label,
    }))),
  ];
  return (
    <SettingRow
      title={label}
      description={
        <>
          {description}
          {value && !selectedAvailable ? <span className="block text-on-danger">当前模型不可用；运行时会按该任务的回退规则处理。</span> : null}
        </>
      }
      control={
        <SettingsSelect
          ariaLabel={label}
          value={value ?? ""}
          options={options}
          disabled={disabled}
          onChange={(next) => onChange(next ? next as ModelKey : null)}
        />
      }
    />
  );
}

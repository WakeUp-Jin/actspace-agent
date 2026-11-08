import { RefreshCw } from "lucide-react";
import type { HarnessStatsFilter, HarnessStatsOptions, HarnessStatsRange, HarnessStatsSessionKind } from "@actspace/shared";
import { SegmentedControl, SettingsSelect } from "../settings/SettingsPrimitives";
import { IconButton } from "../ui/IconButton";
import { RANGE_OPTIONS, SESSION_KIND_OPTIONS, revisionLabel } from "./harness-stats-format";

export const DEFAULT_HARNESS_STATS_FILTER: HarnessStatsFilter = { range: "month", sessionKind: "main" };

/** 空串 = 不筛选（「全部」）。 */
function withOptional(filter: HarnessStatsFilter, key: "mode" | "model" | "revision", value: string): HarnessStatsFilter {
  const { [key]: _removed, ...rest } = filter;
  return value ? { ...rest, [key]: value } : rest;
}

/** 选中的值不在选项里（例如选项还没查回来）时补一项，避免下拉显示成空白。 */
function withCurrent(list: readonly { value: string; label: string }[], value: string | undefined, label: string): { value: string; label: string }[] {
  return value && !list.some((item) => item.value === value) ? [...list, { value, label }] : [...list];
}

/** 工具条：时间范围 + 模式 / 模型 / 会话类型 / 版本 + 右侧刷新。 */
export function HarnessStatsFilters({ filter, options, onChange, onRefresh, refreshing }: {
  filter: HarnessStatsFilter;
  options: HarnessStatsOptions | null;
  onChange: (filter: HarnessStatsFilter) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const modes = withCurrent([{ value: "", label: "全部模式" }, ...(options?.modes ?? []).map((mode) => ({ value: mode, label: mode }))], filter.mode, filter.mode ?? "");
  const models = withCurrent([{ value: "", label: "全部模型" }, ...(options?.models ?? []).map((model) => ({ value: model, label: model }))], filter.model, filter.model ?? "");
  const revisions = withCurrent(
    [{ value: "", label: "最新版本" }, ...(options?.revisions ?? []).map((info) => ({ value: info.key, label: `版本 ${revisionLabel(info.key, options?.revisions)}${info.key === options?.currentRevision ? "（当前）" : ""}` }))],
    filter.revision,
    filter.revision ? `版本 ${revisionLabel(filter.revision, options?.revisions)}` : "",
  );
  return (
    <div role="group" aria-label="统计筛选" className="flex flex-wrap items-center gap-2">
      <SegmentedControl<HarnessStatsRange> ariaLabel="统计时间范围" size="sm" value={filter.range} options={RANGE_OPTIONS} onChange={(range) => onChange({ ...filter, range })} />
      <SettingsSelect size="sm" ariaLabel="筛选模式" value={filter.mode ?? ""} options={modes} onChange={(value) => onChange(withOptional(filter, "mode", value))} />
      <SettingsSelect size="sm" ariaLabel="筛选模型" value={filter.model ?? ""} options={models} onChange={(value) => onChange(withOptional(filter, "model", value))} />
      <SettingsSelect size="sm" ariaLabel="筛选会话类型" value={filter.sessionKind} options={SESSION_KIND_OPTIONS.map((item) => ({ ...item }))} onChange={(value) => onChange({ ...filter, sessionKind: value as HarnessStatsSessionKind })} />
      <SettingsSelect size="sm" ariaLabel="筛选版本" value={filter.revision ?? ""} options={revisions} onChange={(value) => onChange(withOptional(filter, "revision", value))} />
      <span className="ml-auto">
        <IconButton label="刷新 Harness 统计" size="md" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw size={15} className={refreshing ? "animate-spin motion-reduce:animate-none" : undefined} />
        </IconButton>
      </span>
    </div>
  );
}

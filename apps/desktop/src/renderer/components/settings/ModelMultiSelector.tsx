import { useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import type { InstalledModelView, ModelKey } from "@actspace/shared";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/Popover";
import { SegmentedControl } from "./SettingsPrimitives";
import { buildModelSelectorGroups, formatContextWindow, summarizeEnabledModels, type ModelSelectorEntry } from "./model-selector-groups";

/** 搜索结果不超过这个数量时才提供「全部启用」，避免在长目录里一次误开几十个模型。 */
const BULK_ENABLE_LIMIT = 20;

/**
 * 连接详情里的模型多选。触发器固定一行：启用数 + 前两个模型短名 + 剩余数量，不随选中数量变宽。
 * 浮层里按厂商分组（至少两个厂商时），已启用的排在前面，可只看已启用。
 */
export function ModelMultiSelector({ models, onChange, onReasoning }: { models: InstalledModelView[]; onChange: (keys: ModelKey[]) => void | Promise<void>; onReasoning?: (model: InstalledModelView) => void }) {
  const [open, setOpen] = useState(false);
  const summary = summarizeEnabledModels(models);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label="选择启用模型" className="flex h-10 w-full min-w-0 items-center justify-between gap-3 rounded-act-md border border-line bg-surface px-3 text-left text-act-sm text-text-main hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            {summary.enabled ? (
              <>
                <span className="shrink-0 tabular-nums">已启用 {summary.enabled}<span className="text-text-faint"> / {summary.total}</span></span>
                {summary.names.map((name) => <span key={name} title={name} className="min-w-0 max-w-[180px] truncate rounded-act-sm bg-surface-subtle px-1.5 py-0.5 text-act-xs text-text-muted">{name}</span>)}
                {summary.rest > 0 ? <span className="shrink-0 text-act-xs tabular-nums text-text-faint">+{summary.rest}</span> : null}
              </>
            ) : <span className="text-text-faint">选择模型 · 共 {summary.total} 个</span>}
          </span>
          <ChevronDown size={15} className="shrink-0 text-text-faint" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      {open ? <ModelMultiSelectorMenu models={models} onChange={onChange} onReasoning={onReasoning ? (model) => { setOpen(false); onReasoning(model); } : undefined} /> : null}
    </Popover>
  );
}

// 只在打开时挂载：搜索词和「只看已启用」随浮层关闭一起清掉。
function ModelMultiSelectorMenu({ models, onChange, onReasoning }: { models: InstalledModelView[]; onChange: (keys: ModelKey[]) => void | Promise<void>; onReasoning?: (model: InstalledModelView) => void }) {
  const [query, setQuery] = useState("");
  const [onlyEnabled, setOnlyEnabled] = useState(false);
  const enabled = models.filter((model) => model.settings.enabled).map((model) => model.definition.key);
  const groups = buildModelSelectorGroups(models, { query, onlyEnabled });
  const visible = groups.flatMap((group) => group.entries);
  const allVisible = visible.length > 0 && visible.every((entry) => entry.enabled);
  const toggle = (key: ModelKey) => { void onChange(enabled.includes(key) ? enabled.filter((item) => item !== key) : [...enabled, key]); };
  const toggleVisible = () => {
    const keys = visible.map((entry) => entry.model.definition.key);
    void onChange(allVisible ? enabled.filter((key) => !keys.includes(key)) : Array.from(new Set([...enabled, ...keys])));
  };
  return (
    <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-[280px] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line pr-2">
        <label className="relative block min-w-0 flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" aria-hidden="true" />
          <input autoFocus aria-label="搜索模型" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型名称或 ID" className="h-9 w-full bg-transparent pl-9 pr-2 text-act-xs text-text-main outline-none placeholder:text-text-faint" />
        </label>
        <SegmentedControl size="sm" ariaLabel="显示范围" value={onlyEnabled ? "enabled" : "all"} onChange={(value) => setOnlyEnabled(value === "enabled")} options={[{ value: "all", label: `全部 ${models.length}` }, { value: "enabled", label: `已启用 ${enabled.length}` }]} />
      </div>
      <div role="listbox" aria-label="启用模型" aria-multiselectable="true" className="max-h-72 overflow-y-auto py-1">
        {visible.length > 0 && visible.length <= BULK_ENABLE_LIMIT ? (
          <button type="button" role="option" aria-selected={allVisible} onClick={toggleVisible} className="flex w-full items-center gap-2 px-3 py-2 text-left text-act-xs font-semibold text-text-main hover:bg-hover-overlay focus-visible:bg-hover-overlay focus-visible:outline-none">
            <CheckBox checked={allVisible} />全部启用
          </button>
        ) : null}
        {groups.map((group) => (
          <div key={group.vendor ?? "_"} role="group" aria-label={group.vendor ?? undefined}>
            {group.vendor ? (
              <div className="sticky top-0 z-10 flex items-center justify-between bg-surface-raised px-3 pb-1 pt-2 text-act-xxs font-medium text-text-faint">
                <span>{group.vendor}</span><span className="tabular-nums">{group.enabledCount} / {group.entries.length}</span>
              </div>
            ) : null}
            {group.entries.map((entry) => <ModelOption key={entry.model.definition.key} entry={entry} onToggle={toggle} onReasoning={onReasoning} />)}
          </div>
        ))}
        {visible.length === 0 ? <p className="px-3 py-4 text-center text-act-xs text-text-faint">{onlyEnabled && !query ? "还没有启用模型" : "没有匹配的模型"}</p> : null}
      </div>
    </PopoverContent>
  );
}

function ModelOption({ entry, onToggle, onReasoning }: { entry: ModelSelectorEntry; onToggle: (key: ModelKey) => void; onReasoning?: (model: InstalledModelView) => void }) {
  const { definition } = entry.model;
  const context = formatContextWindow(definition.contextWindow);
  return (
    <div className="flex items-center gap-2 pr-3 hover:bg-hover-overlay">
      <button type="button" role="option" aria-selected={entry.enabled} title={entry.fullLabel} onClick={() => onToggle(definition.key)} className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-3 text-left text-act-xs text-text-main focus-visible:bg-hover-overlay focus-visible:outline-none">
        <CheckBox checked={entry.enabled} />
        <span className="min-w-0 truncate">{entry.name}</span>
        <span aria-hidden="true" className="min-w-0 flex-1 truncate font-mono text-act-xxs text-text-faint">{definition.apiModel}</span>
        {context ? <span aria-hidden="true" className="shrink-0 text-act-xxs tabular-nums text-text-faint">{context}</span> : null}
      </button>
      {definition.source === "custom" && onReasoning ? <button type="button" aria-label={`配置推理能力：${definition.label}`} className="shrink-0 rounded-act-sm text-act-xxs text-text-muted hover:text-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring" onClick={() => onReasoning(entry.model)}>配置推理</button> : null}
    </div>
  );
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center rounded-act-sm border ${checked ? "border-action bg-action text-surface" : "border-line"}`}>
      {checked ? <Check size={13} /> : null}
    </span>
  );
}

import { Search } from "lucide-react";
import { useState } from "react";
import type { HostModel } from "../../connection/connection-store";
import { effortLabel, groupModels } from "../../sessions/model-options";
import { Segmented } from "../../ui/Segmented";
import { Sheet, SheetGroupLabel, SheetOption } from "../../ui/Sheet";

type Props = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly models: readonly HostModel[];
  readonly model: string;
  readonly effort?: string | null;
  readonly effortOptions?: readonly string[];
  readonly onPick: (next: { model: string; effort: string | null }) => void;
};

/** 模型较多时显示搜索框。 */
const SEARCH_MIN = 7;

/** 按供应商分组的模型列表；模型支持推理强度时顶部是分段控件。 */
export function ModelSheet({ open, onOpenChange, models, model, effort = null, effortOptions = [], onPick }: Props) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle ? models.filter(item => `${item.name} ${item.id}`.toLowerCase().includes(needle)) : models;
  return (
    <Sheet open={open} onOpenChange={next => { if (!next) setQuery(""); onOpenChange(next); }} title="模型">
      {effortOptions.length ? (
        <div className="pb-1 pt-1">
          <Segmented label="推理强度" className="w-full" value={effort ?? ""} options={effortOptions.map(value => ({ value, label: effortLabel(value) }))} onChange={value => onPick({ model, effort: value })} />
        </div>
      ) : null}
      {models.length >= SEARCH_MIN ? (
        <label className="mb-1.5 mt-1 flex h-[38px] items-center gap-2 rounded-act-md bg-surface-subtle px-3 text-text-subtle">
          <Search size={16} aria-hidden />
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索模型" aria-label="搜索模型" className="min-w-0 flex-1 border-0 bg-transparent text-act-base text-text-main outline-none placeholder:text-text-subtle" />
        </label>
      ) : null}
      {groupModels(shown).map(group => (
        <div key={group.provider} role="radiogroup" aria-label={group.provider}>
          <SheetGroupLabel>{group.provider}</SheetGroupLabel>
          {group.models.map(item => <SheetOption key={item.id} selected={item.id === model} title={item.name} onSelect={() => { onPick({ model: item.id, effort }); onOpenChange(false); setQuery(""); }} />)}
        </div>
      ))}
      {models.length === 0 ? <p className="m-0 py-6 text-act-md text-text-faint">服务器没有提供可选模型</p> : shown.length === 0 ? <p className="m-0 py-6 text-act-md text-text-faint">没有匹配的模型</p> : null}
    </Sheet>
  );
}

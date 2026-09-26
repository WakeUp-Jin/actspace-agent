import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { SettingGroup, SettingTag, SettingsInput } from "./SettingsPrimitives";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { COMMON_ANTHROPIC_MODELS, isKnownCatalogModel, modelDisplayLabel } from "./custom-connection-shared";

export type ModelPickerValue = { readonly selected: readonly string[]; readonly defaultId: string | null };
export type ListedModel = { readonly id: string; readonly label?: string };

const SEARCH_THRESHOLD = 8;

/**
 * 选模型：服务返回了列表时整行点选；没有列表时用常用快捷项和手动输入。
 * 状态由调用方持有，这里只负责勾选、默认模型和手动追加的交互。
 */
export function ConnectionModelPicker({
  listed,
  value,
  onChange,
  showCommon,
  footer,
}: {
  listed: readonly ListedModel[] | null;
  value: ModelPickerValue;
  onChange: (value: ModelPickerValue) => void;
  showCommon: boolean;
  /** 分组最后一行，例如「按官方价计费」。 */
  footer?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState("");
  const hasList = Boolean(listed?.length);
  const labels = new Map((listed ?? []).map((model) => [model.id, model.label]));

  const toggle = (id: string) => {
    if (value.selected.includes(id)) {
      const selected = value.selected.filter((item) => item !== id);
      onChange({ selected, defaultId: value.defaultId === id ? selected[0] ?? null : value.defaultId });
    } else {
      onChange({ selected: [...value.selected, id], defaultId: value.defaultId ?? id });
    }
  };
  const addManual = () => {
    const id = manual.trim();
    if (!id) return;
    if (!value.selected.includes(id)) onChange({ selected: [...value.selected, id], defaultId: value.defaultId ?? id });
    setManual("");
  };

  // 列表模式下，手动加的 ID 也要能看到，接在服务列表后面。
  const listedIds = (listed ?? []).map((model) => model.id);
  const ids = hasList ? [...listedIds, ...value.selected.filter((id) => !listedIds.includes(id))] : [...value.selected];
  const normalized = query.trim().toLocaleLowerCase();
  const visible = normalized ? ids.filter((id) => id.toLocaleLowerCase().includes(normalized) || modelDisplayLabel(id, labels.get(id)).toLocaleLowerCase().includes(normalized)) : ids;
  const chips = showCommon ? COMMON_ANTHROPIC_MODELS.filter((id) => !value.selected.includes(id)) : [];

  const addLine = (
    <div className="flex items-center gap-2 px-4 py-2.5">
      <SettingsInput
        mono
        width="full"
        autoFocus={hasList}
        aria-label="模型 ID"
        placeholder="输入模型 ID"
        value={manual}
        onChange={(event) => setManual(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addManual(); } }}
      />
      <Button disabled={!manual.trim()} onClick={addManual}>添加</Button>
    </div>
  );

  return (
    <SettingGroup title={hasList ? "选择模型" : "添加模型"} meta={hasList ? `已选 ${value.selected.length} 个` : undefined}>
      {hasList && ids.length > SEARCH_THRESHOLD ? (
        <div className="px-4 py-2.5">
          <label className="relative block">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" aria-hidden="true" />
            <SettingsInput width="full" className="pl-8" aria-label="搜索模型" placeholder="搜索模型" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
      ) : null}
      {!hasList && chips.length ? (
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5">
          <span className="mr-1 text-act-xs text-text-faint">常用</span>
          {chips.map((id) => (
            <button key={id} type="button" onClick={() => toggle(id)} className="inline-flex h-6 items-center gap-1 rounded-act-pill border border-line bg-surface px-2 font-mono text-act-xs text-text-muted transition-colors hover:border-line-strong hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/30">
              <Plus size={11} aria-hidden="true" />{id}
            </button>
          ))}
        </div>
      ) : null}
      {!hasList ? addLine : null}
      {visible.map((id) => (
        <ModelRow
          key={id}
          id={id}
          label={modelDisplayLabel(id, labels.get(id))}
          pickable={hasList}
          selected={value.selected.includes(id)}
          isDefault={value.defaultId === id}
          onToggle={() => toggle(id)}
          onSetDefault={() => onChange({ ...value, defaultId: id })}
        />
      ))}
      {hasList && normalized && visible.length === 0 ? <p className="px-4 py-3 text-act-xs text-text-faint">没有匹配的模型</p> : null}
      {hasList ? (manualOpen ? addLine : (
        <div className="px-4 py-2.5">
          <button type="button" onClick={() => setManualOpen(true)} className="text-act-xs text-text-muted underline-offset-2 hover:text-text-main hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/30">列表里没有？手动输入模型 ID</button>
        </div>
      )) : null}
      {footer}
    </SettingGroup>
  );
}

function ModelRow({ id, label, pickable, selected, isDefault, onToggle, onSetDefault }: {
  id: string;
  label: string;
  pickable: boolean;
  selected: boolean;
  isDefault: boolean;
  onToggle: () => void;
  onSetDefault: () => void;
}) {
  const known = isKnownCatalogModel(id);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || (event.key !== " " && event.key !== "Enter")) return;
    event.preventDefault();
    onToggle();
  };
  const right = isDefault
    ? <SettingTag>默认</SettingTag>
    : selected
      ? <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100" onClick={(event) => { event.stopPropagation(); onSetDefault(); }}>设为默认</Button>
      : null;
  return (
    <div
      {...(pickable ? { role: "checkbox", "aria-checked": selected, "aria-label": label, tabIndex: 0, onClick: onToggle, onKeyDown } : {})}
      className={`group flex min-h-[48px] items-center gap-3 px-4 py-2 ${pickable ? "cursor-pointer transition-colors duration-(--motion-fast) hover:bg-hover-overlay focus-visible:bg-hover-overlay focus-visible:outline-none" : ""}`}
    >
      {pickable ? (
        <span aria-hidden="true" className={`grid h-4 w-4 shrink-0 place-items-center rounded-act-xs border ${selected ? "border-transparent bg-text-main text-surface" : "border-line-strong bg-surface"}`}>
          {selected ? <Check size={11} strokeWidth={3} /> : null}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-act-sm font-medium text-text-main">{label}{known ? null : <SettingTag tone="warn">能力未知</SettingTag>}</div>
        {label !== id ? <div className="mt-0.5 truncate font-mono text-act-xs text-text-faint">{id}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {right}
        {pickable ? null : <IconButton label={`移除 ${id}`} onClick={onToggle}><X size={14} aria-hidden="true" /></IconButton>}
      </div>
    </div>
  );
}

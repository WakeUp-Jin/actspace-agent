import { useEffect, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import type { ConnectionModelView, ConnectionView, PurposeBinding, ThinkingLevel } from "@actspace/shared";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/Popover";
import { Button, cx } from "../../ui/Button";
import {
  LEVEL_DESCRIPTIONS,
  PURPOSES,
  canSeeImages,
  findModel,
  formatPrice,
  formatTokens,
  levelName,
  pickerGroups,
  purposeSummary,
  thinkingKind,
  type PurposeMeta,
} from "./model-view";

/**
 * 用途选择器：双栏浮层。左栏搜索 + 按连接分组的模型，右栏是聚焦模型的事实和思考档位。
 * 点模型就选中（档位用模型默认），点档位选中「这个模型 + 这个档位」。
 */
export function PurposePicker({
  purpose,
  connections,
  binding,
  onChange,
  onGoToModel,
}: {
  purpose: PurposeMeta;
  connections: readonly ConnectionView[];
  binding: PurposeBinding;
  onChange: (binding: PurposeBinding) => void;
  onGoToModel: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<string | null>(binding.model);
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setFocus(binding.model);
  }, [open, binding.model]);

  const summary = purposeSummary(connections, binding);
  const followLabel = purpose.follow ? `跟随${PURPOSES.find((item) => item.id === purpose.follow)!.label}` : "未设置";
  const groups = pickerGroups(connections, purpose, query);
  const focused = findModel(connections, focus);

  const pickModel = (model: ConnectionModelView) => {
    setFocus(model.key);
    if (binding.model === model.key) return;
    const levels = model.effective.thinking?.levels ?? [];
    onChange({ model: model.key, thinking: binding.thinking && levels.includes(binding.thinking) ? binding.thinking : null });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${purpose.label}模型`}
          className={cx(
            "inline-flex h-7 max-w-[320px] items-center gap-1.5 whitespace-nowrap rounded-act-md pl-2.5 pr-2 text-act-sm transition-colors hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/30 data-[state=open]:bg-hover-overlay max-[600px]:max-w-full",
            summary?.missing ? "text-on-danger" : "text-text-main",
          )}
        >
          {summary ? (
            <>
              <span className="min-w-0 truncate">{summary.label}</span>
              {summary.level ? <span className="text-text-muted">· {summary.level}</span> : null}
            </>
          ) : <span className="text-text-faint">{followLabel}</span>}
          <ChevronDown size={13} strokeWidth={1.9} aria-hidden="true" className="shrink-0 text-text-subtle" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" radius="lg" className="flex w-[580px] flex-col overflow-hidden p-0">
        <div className="flex h-[352px] min-h-0">
          <div className="flex w-[240px] shrink-0 flex-col border-r border-line/60 max-[600px]:w-[44%]">
            <label className="flex h-[38px] shrink-0 items-center gap-2 border-b border-line/60 px-3 text-text-subtle">
              <Search size={14} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索模型"
                aria-label="搜索模型"
                className="min-w-0 flex-1 bg-transparent text-act-sm text-text-main outline-none placeholder:text-text-subtle"
              />
            </label>
            <div role="listbox" aria-label={`${purpose.label}可选模型`} className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2 pt-1">
              {purpose.follow ? (
                <PickerRow selected={!binding.model} focused={!focus} label={followLabel} onClick={() => { setFocus(null); onChange({ model: null, thinking: binding.thinking }); setOpen(false); }} />
              ) : null}
              {groups.map((group) => (
                <div key={group.connection.connectionId}>
                  <div className="px-2 pb-1 pt-2.5 text-act-xxs text-text-faint">{group.connection.label}</div>
                  {group.models.map((model) => (
                    <PickerRow
                      key={model.key}
                      selected={binding.model === model.key}
                      focused={focus === model.key}
                      label={model.effective.label}
                      meta={model.effective.contextWindow ? formatTokens(model.effective.contextWindow) : undefined}
                      onClick={() => pickModel(model)}
                    />
                  ))}
                </div>
              ))}
              {groups.length === 0 ? <div className="px-2 pt-2.5 text-act-xxs text-text-faint">没有匹配的模型</div> : null}
            </div>
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto px-4 py-3.5">
            {focused ? (
              <FocusedModel
                model={focused}
                level={binding.model === focused.key ? binding.thinking ?? focused.effective.thinking?.default ?? null : null}
                onLevel={(level) => onChange({ model: focused.key, thinking: level })}
                onGoToModel={() => { setOpen(false); onGoToModel(focused.key); }}
              />
            ) : (
              <p className="text-act-xs leading-relaxed text-text-muted">
                {purpose.follow ? `选一个模型。不选就${followLabel}。` : "选一个模型。"}
              </p>
            )}
          </div>
        </div>
        {purpose.needImage ? <div className="border-t border-line/60 px-3 py-2 text-act-xxs text-text-faint">只列出能看图的模型</div> : null}
      </PopoverContent>
    </Popover>
  );
}

function PickerRow({ selected, focused, label, meta, onClick }: { selected: boolean; focused: boolean; label: string; meta?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-1.5 rounded-act-md px-2 py-1.5 text-left text-act-sm text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/30",
        focused ? "bg-selected" : "hover:bg-hover-overlay",
      )}
    >
      <span className="grid w-3.5 shrink-0 place-items-center">{selected ? <Check size={13} strokeWidth={2.2} aria-hidden="true" /> : null}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta ? <span className="shrink-0 text-act-xxs tabular-nums text-text-faint">{meta}</span> : null}
    </button>
  );
}

function FocusedModel({ model, level, onLevel, onGoToModel }: { model: ConnectionModelView; level: ThinkingLevel | null; onLevel: (level: ThinkingLevel) => void; onGoToModel: () => void }) {
  const { effective } = model;
  const thinking = effective.thinking;
  const kind = thinkingKind(thinking);
  return (
    <div>
      <div className="text-act-md font-semibold text-text-main">{effective.label}</div>
      <div className="mt-px break-all font-mono text-act-xxs text-text-faint">{model.apiModel}</div>
      <dl className="my-3 grid grid-cols-[1fr_1fr_1.4fr] gap-2.5 border-y border-line/60 py-2.5">
        <Fact label="上下文" value={formatTokens(effective.contextWindow)} />
        <Fact label="图片" value={canSeeImages(effective) ? "支持" : "不支持"} />
        <Fact label="价格（入 / 出）" value={effective.rates ? `${formatPrice(effective.rates.input)} / ${formatPrice(effective.rates.output)}` : "—"} />
      </dl>
      <div className="mb-1 text-act-xs font-semibold text-text-muted">思考</div>
      {kind === "unknown" ? (
        <>
          <p className="text-act-xs leading-relaxed text-text-muted">还没有这个模型的思考信息，选择时不会出现档位。</p>
          <Button variant="secondary" size="xs" className="mt-2" onClick={onGoToModel}>去补充</Button>
        </>
      ) : kind === "none" ? (
        <p className="text-act-xs text-text-muted">这个模型不支持思考。</p>
      ) : kind === "always" ? (
        <p className="text-act-xs text-text-muted">这个模型始终思考，没有可调档位。</p>
      ) : (
        <div role="radiogroup" aria-label="思考档位">
          {thinking!.levels.map((item) => (
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={level === item}
              onClick={() => onLevel(item)}
              className="-mx-2 flex w-[calc(100%+16px)] items-center gap-2.5 rounded-act-md px-2 py-1.5 text-left text-act-sm hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/30"
            >
              <span className={cx("grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border", level === item ? "border-action" : "border-line-strong")}>
                {level === item ? <span className="h-1.5 w-1.5 rounded-full bg-action" /> : null}
              </span>
              <span className="w-11 shrink-0 font-medium text-text-main">{levelName(thinking!.levels, item)}</span>
              <span className="min-w-0 flex-1 text-act-xs text-text-muted">{LEVEL_DESCRIPTIONS[item]}</span>
              {thinking!.default === item ? <span className="shrink-0 text-act-xxs text-text-faint">模型默认</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-act-xxs text-text-faint">{label}</dt>
      <dd className="mt-px truncate text-act-xs tabular-nums text-text-main">{value}</dd>
    </div>
  );
}

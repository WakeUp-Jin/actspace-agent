import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { Box, Check, Plus } from "lucide-react";
import { THINKING_LEVELS, type ConnectionModelView, type EffectiveModel, type ModelRates, type ThinkingLevel } from "@actspace/shared";
import { cx } from "../../ui/Button";
import { ProviderLogo } from "../ProviderLogo";
import { SettingsInput, SettingsSelect } from "../SettingsPrimitives";
import { LEVEL_LABELS, familyLogo, formatPrice, formatTokens, levelName, rateMultiplierNote, thinkingKind } from "./model-view";

/** 设置 › 模型里反复出现的小件：字段行、家族 mark、勾选框、三项关键信息、价格四格、档位多选。 */

/** 左标签 + 右控件的一行，放在 SettingGroup 里。 */
export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[46px] items-center gap-3.5 px-4 py-2 max-[600px]:flex-col max-[600px]:items-start max-[600px]:gap-1.5">
      <div className="w-[88px] shrink-0 text-act-xs text-text-muted">{label}</div>
      <div className="flex min-w-0 flex-1 items-center gap-2.5 max-[600px]:w-full max-[600px]:flex-wrap">{children}</div>
    </div>
  );
}

/** 展开区里的「标签 · 控件」网格。 */
export function EditGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3">{children}</div>;
}

export function EditItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <div className="text-act-xs text-text-muted">{label}</div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </>
  );
}

export function FamilyMark({ model }: { model: Pick<ConnectionModelView, "apiModel" | "effective"> }) {
  const key = familyLogo(model);
  if (key) return <ProviderLogo logoKey={key} size="xs" />;
  return (
    <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-act-sm bg-surface-subtle text-text-subtle">
      <Box size={13} strokeWidth={1.6} />
    </span>
  );
}

/** 模型列表框最后一行：整行可点，展开就地添加。 */
export function AddModelRow({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 px-4 py-3 text-act-xs text-text-muted hover:bg-hover-overlay hover:text-text-main">
      <Plus size={14} aria-hidden="true" />
      添加模型
    </button>
  );
}

export function CheckBox({ checked, label, onChange }: { checked: boolean; label: string; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(event) => { event.stopPropagation(); onChange(!checked); }}
      className={cx(
        "grid h-4 w-4 shrink-0 place-items-center rounded-act-xs border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/30",
        checked ? "border-action bg-action text-on-action" : "border-line-strong bg-surface",
      )}
    >
      {checked ? <Check size={11} strokeWidth={2.6} aria-hidden="true" /> : null}
    </button>
  );
}

/** 失焦或回车时才提交的输入框；外部值变了就同步。 */
/** 失焦或回车才提交；onCommit 返回 false 表示输入不合法，输入框退回原值。 */
export function CommitInput({ value, onCommit, ...rest }: Omit<ComponentProps<typeof SettingsInput>, "value" | "onChange" | "onBlur"> & { value: string; onCommit: (text: string) => boolean | void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <SettingsInput
      {...rest}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => { if (text !== value && onCommit(text) === false) setText(value); }}
      onKeyDown={(event) => {
        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        if (event.key === "Escape") setText(value);
      }}
    />
  );
}

export function DefaultLevelSelect({ levels, value, onChange }: { levels: readonly ThinkingLevel[]; value: ThinkingLevel | undefined; onChange: (level: ThinkingLevel) => void }) {
  return (
    <SettingsSelect
      size="sm"
      ariaLabel="默认思考"
      value={value ?? ""}
      options={levels.map((level) => ({ value: level, label: levelName(levels, level) }))}
      onChange={(next) => onChange(next as ThinkingLevel)}
    />
  );
}

/** 三项关键信息：上下文 / 默认思考 / 价格。 */
export function KeyFacts({ effective, onDefault, actions }: { effective: EffectiveModel; onDefault?: (level: ThinkingLevel) => void; actions?: ReactNode }) {
  const thinking = effective.thinking;
  const kind = thinkingKind(thinking);
  const note = rateMultiplierNote(effective);
  return (
    <div className="flex flex-wrap items-end gap-x-9 gap-y-3">
      <KeyFact label="上下文">{effective.contextWindow ? formatTokens(effective.contextWindow) : <span className="text-text-faint">—</span>}</KeyFact>
      <KeyFact label="默认思考">
        {(kind === "levels" || kind === "mandatory" || kind === "toggle") && onDefault
          ? <DefaultLevelSelect levels={thinking!.levels} value={thinking!.default} onChange={onDefault} />
          : <span className="text-text-faint">{kind === "always" ? "始终思考" : kind === "none" ? "不支持" : "未知"}</span>}
      </KeyFact>
      <KeyFact label="价格 · 每百万 token">
        {effective.rates ? (
          <>
            {formatPrice(effective.rates.input)} / {formatPrice(effective.rates.output)}
            {note ? <small className="ml-1 text-act-xxs text-text-faint">{note}</small> : null}
          </>
        ) : <span className="text-text-faint">—</span>}
      </KeyFact>
      {actions ? <div className="-mr-2 ml-auto flex items-center gap-1">{actions}</div> : null}
    </div>
  );
}

function KeyFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-act-xxs text-text-faint">{label}</div>
      <div className="flex h-[30px] items-center text-act-sm tabular-nums text-text-main">{children}</div>
    </div>
  );
}

export type RateTexts = Record<keyof ModelRates, string>;
const RATE_FIELDS: readonly [keyof ModelRates, string][] = [["input", "输入"], ["output", "输出"], ["cacheRead", "缓存读"], ["cacheWrite", "缓存写"]];

export function ratesToTexts(rates: ModelRates | null): RateTexts {
  const text = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(Number(value.toFixed(6))));
  return { input: text(rates?.input), output: text(rates?.output), cacheRead: text(rates?.cacheRead), cacheWrite: text(rates?.cacheWrite) };
}

/** 价格四格（美元 / 百万 token）。只读时显示格式化后的价格。 */
export function PriceFields({ values, editable, onCommit }: { values: RateTexts; editable: boolean; onCommit?: (field: keyof ModelRates, text: string) => boolean | void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {RATE_FIELDS.map(([field, label]) => editable ? (
        <label key={field} className="flex h-[30px] w-[100px] items-center gap-1 rounded-act-sm border border-line bg-surface px-1.5 focus-within:border-focus-ring">
          <span className="whitespace-nowrap text-act-xxs text-text-faint">{label}</span>
          <PriceInput value={values[field]} label={`${label}价格`} onCommit={(text) => onCommit?.(field, text)} />
        </label>
      ) : (
        <div key={field} className="flex h-[30px] w-[100px] items-center gap-1 rounded-act-sm border border-line bg-surface-subtle px-1.5">
          <span className="whitespace-nowrap text-act-xxs text-text-faint">{label}</span>
          <b className="ml-auto text-act-xs font-normal tabular-nums text-text-main">{formatPrice(values[field] === "" ? null : Number(values[field]))}</b>
        </div>
      ))}
    </div>
  );
}

function PriceInput({ value, label, onCommit }: { value: string; label: string; onCommit: (text: string) => boolean | void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      value={text}
      aria-label={label}
      placeholder="—"
      inputMode="decimal"
      onChange={(event) => setText(event.target.value)}
      onBlur={() => { if (text !== value && onCommit(text) === false) setText(value); }}
      onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}
      className="w-full min-w-0 bg-transparent text-right text-act-xs tabular-nums text-text-main outline-none placeholder:text-text-subtle"
    />
  );
}

/** 思考档位多选：亮起的是这个模型支持的档位。 */
export function LevelToggles({ levels, onToggle }: { levels: readonly ThinkingLevel[]; onToggle: (level: ThinkingLevel) => void }) {
  return (
    <div role="group" aria-label="思考档位" className="inline-flex flex-wrap gap-0.5 rounded-act-sm border border-line bg-surface-subtle p-0.5">
      {THINKING_LEVELS.map((level) => {
        const on = levels.includes(level);
        return (
          <button
            key={level}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(level)}
            className={cx(
              "h-6 min-w-10 rounded-act-xs px-2 text-act-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/30",
              on ? "bg-surface font-medium text-text-main shadow-act-thumb" : "text-text-faint hover:text-text-main",
            )}
          >
            {LEVEL_LABELS[level]}
          </button>
        );
      })}
    </div>
  );
}

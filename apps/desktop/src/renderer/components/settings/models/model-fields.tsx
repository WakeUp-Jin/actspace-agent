import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { Check } from "lucide-react";
import { THINKING_LEVELS, type ConnectionModelView, type EffectiveModel, type ModelOverrides, type ModelRates, type ThinkingLevel } from "@actspace/shared";
import { cx } from "../../ui/Button";
import { Select } from "../../ui/Select";
import { ProviderLogo } from "../ProviderLogo";
import { SettingsInput } from "../SettingsPrimitives";
import {
  LEVEL_LABELS,
  canRestore,
  canSeeImages,
  familyLogo,
  formatMultiplier,
  formatRateInput,
  formatTokenInput,
  levelName,
  parseRate,
  parseTokens,
  toggleLevel,
} from "./model-view";

/** 设置 › 模型里反复出现的小件：字段行、家族 mark、带单位的输入框、「已保存」、勾选 chip、模型字段网格。 */

/** 左标签 + 右控件的一行，放在 SettingGroup 里。 */
export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-4 py-2 max-[600px]:flex-wrap max-[600px]:gap-1.5">
      <div className="w-[72px] shrink-0 text-act-xs text-text-muted max-[600px]:w-full">{label}</div>
      <div className="relative flex min-w-0 flex-1 items-center gap-2 max-[600px]:w-full max-[600px]:flex-wrap">{children}</div>
    </div>
  );
}

/** 没有标识的厂商用首字母占位，不借用别家的 Logo。 */
export function FamilyMark({ model }: { model: Pick<ConnectionModelView, "apiModel" | "effective"> }) {
  const key = familyLogo(model);
  if (key) return <ProviderLogo logoKey={key} size="xs" />;
  const letter = model.apiModel.replace(/^[^/]+\//, "").slice(0, 1).toUpperCase();
  return (
    <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-act-sm bg-surface-subtle text-act-xxs font-semibold text-text-muted">
      {letter}
    </span>
  );
}

/** 输入框里短暂出现的「已保存」。每次保存换一个 key 重新播放。 */
export function SavedMark({ offset = "right-2.5" }: { offset?: string }) {
  return (
    <span className={cx("pointer-events-none absolute inset-y-0 flex items-center gap-1 text-act-xs text-operational animate-[settings-saved-fade_1.8s_forwards] motion-reduce:animate-none", offset)}>
      <Check size={12} strokeWidth={2.4} aria-hidden="true" />
      已保存
    </span>
  );
}

/** 失焦或回车才提交；onCommit 返回 false 表示输入不合法，输入框退回原值。Esc 放弃这次修改。 */
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
        if (event.key === "Escape") { event.stopPropagation(); setText(value); }
      }}
    />
  );
}

/** 输入框里贴着边的单位：右边是「tokens」「入」「出」，左边是「官方价 ×」。 */
export function UnitBox({ unit, side = "right", className, children }: { unit: string; side?: "left" | "right"; className?: string; children: ReactNode }) {
  return (
    <span className={cx("relative min-w-0 flex-1", className)}>
      {children}
      <span aria-hidden="true" className={cx("pointer-events-none absolute inset-y-0 flex items-center text-act-xxs text-text-subtle", side === "left" ? "left-2.5" : "right-2.5")}>{unit}</span>
    </span>
  );
}

const UNIT_PAD: Record<string, string> = { tokens: "pr-[52px]" };
const unitPad = (unit: string) => UNIT_PAD[unit] ?? "pr-7";

function UnitInput({ unit, ...rest }: ComponentProps<typeof CommitInput> & { unit: string }) {
  return (
    <UnitBox unit={unit}>
      <CommitInput width="full" {...rest} className={cx("tabular-nums", unitPad(unit))} />
    </UnitBox>
  );
}

/** 勾选 chip：思考档位、输入类型。 */
export function Chip({ checked, disabled = false, onToggle, children }: { checked: boolean; disabled?: boolean; onToggle?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className={cx(
        "inline-flex h-[30px] items-center gap-1.5 rounded-act-md border border-line px-2.5 text-act-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/30",
        checked ? "text-text-main" : "text-text-muted",
        disabled ? "cursor-default opacity-70" : "hover:bg-hover-overlay",
      )}
    >
      <CheckMark checked={checked} />
      {children}
    </button>
  );
}

export function CheckMark({ checked, muted = false }: { checked: boolean; muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "grid h-3.5 w-3.5 shrink-0 place-items-center rounded-act-xs border",
        muted ? "border-line bg-surface-subtle text-text-faint" : checked ? "border-action bg-action text-on-action" : "border-line-strong bg-surface",
      )}
    >
      {checked ? <Check size={10} strokeWidth={2.8} /> : null}
    </span>
  );
}

/* ---------------------------------------------------------------- 模型字段网格 */

export type FieldKey = "label" | "contextWindow" | "maxOutput" | "thinking" | "input" | "rates";
export type FieldsChange = <K extends keyof ModelOverrides>(field: K, value: ModelOverrides[K] | undefined) => void;

/**
 * 模型的字段：平时三项（上下文、默认思考、价格），「显示更多」再给名称、最大输出、缓存价、思考档位、输入类型。
 * 每个字段改完就交给 onChange；值从 effective 读，保存后跟着新的有效值刷新。卡片和手动添加共用。
 */
export function ModelFields({ effective, more, hideLabel = false, onChange }: { effective: EffectiveModel; more: boolean; hideLabel?: boolean; onChange: FieldsChange }) {
  const thinking = effective.thinking;
  const restore = (field: FieldKey) => canRestore(effective, field) ? () => onChange(field, undefined) : undefined;
  const scaled = effective.ratesScaled && effective.multiplier !== 1 ? `· 已 ×${formatMultiplier(effective.multiplier)}` : null;
  const tokens = (field: "contextWindow" | "maxOutput") => (text: string) => {
    const value = parseTokens(text);
    if (value === undefined) return false;
    onChange(field, value ?? undefined);
  };
  const commitCache = (field: "cacheRead" | "cacheWrite") => (text: string) => {
    const value = parseRate(text);
    if (value === undefined || !effective.rates) return false;
    onChange("rates", { ...effective.rates, [field]: value });
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-3 max-[600px]:grid-cols-1">
        <Field label="上下文" onRestore={restore("contextWindow")}>
          <UnitInput unit="tokens" value={formatTokenInput(effective.contextWindow)} placeholder="例如 128K" aria-label="上下文" onCommit={tokens("contextWindow")} />
        </Field>
        <Field label="默认思考" onRestore={restore("thinking")}>
          <DefaultThinking effective={effective} onChange={(level) => thinking && onChange("thinking", { levels: thinking.levels, default: level })} />
        </Field>
        <Field label="价格 · 每百万 token" extra={scaled} onRestore={restore("rates")}>
          <RatePair rates={effective.rates} onCommit={(rates) => onChange("rates", rates ?? undefined)} />
        </Field>
      </div>
      {more ? (
        <div className="mt-3 grid grid-cols-3 gap-3 max-[600px]:grid-cols-1">
          {hideLabel ? null : (
            <Field label="显示名称" onRestore={restore("label")}>
              <CommitInput width="full" value={effective.label} aria-label="显示名称" onCommit={(text) => onChange("label", text.trim() || undefined)} />
            </Field>
          )}
          <Field label="最大输出" onRestore={restore("maxOutput")}>
            <UnitInput unit="tokens" value={formatTokenInput(effective.maxOutput)} placeholder="例如 32K" aria-label="最大输出" onCommit={tokens("maxOutput")} />
          </Field>
          <Field label="缓存价格 · 每百万 token">
            <span className="flex gap-1.5">
              <UnitInput unit="读" value={formatRateInput(effective.rates?.cacheRead)} placeholder="—" disabled={!effective.rates} aria-label="缓存读价格" onCommit={commitCache("cacheRead")} />
              <UnitInput unit="写" value={formatRateInput(effective.rates?.cacheWrite)} placeholder="—" disabled={!effective.rates} aria-label="缓存写价格" onCommit={commitCache("cacheWrite")} />
            </span>
          </Field>
          <Field label="思考档位" wide>
            <span role="group" aria-label="思考档位" className="flex flex-wrap gap-1.5">
              {THINKING_LEVELS.map((level) => (
                <Chip key={level} checked={Boolean(thinking?.levels.includes(level))} onToggle={() => onChange("thinking", toggleLevel(thinking, level))}>{LEVEL_LABELS[level]}</Chip>
              ))}
            </span>
          </Field>
          <Field label="输入类型" wide>
            <span role="group" aria-label="输入类型" className="flex flex-wrap gap-1.5">
              <Chip checked disabled>文本</Chip>
              <Chip checked={canSeeImages(effective)} onToggle={() => onChange("input", canSeeImages(effective) ? ["text"] : ["text", "image"])}>图片</Chip>
            </span>
          </Field>
        </div>
      ) : null}
    </>
  );
}

/** 字段标题；用户改过、目录里又有原值时，标题后面给「已修改 · 恢复」。 */
function Field({ label, extra, wide = false, onRestore, children }: { label: string; extra?: ReactNode; wide?: boolean; onRestore?: () => void; children: ReactNode }) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", wide && "col-span-full")}>
      <div className="flex min-h-4 items-center gap-1.5 text-act-xs text-text-faint">
        <span>{label}</span>
        {extra ? <span className="text-text-subtle">{extra}</span> : null}
        {onRestore ? (
          <>
            <span className="text-act-xxs text-info">已修改</span>
            <button type="button" onClick={onRestore} className="ml-auto text-act-xxs text-text-faint underline underline-offset-2 hover:text-text-main">恢复</button>
          </>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function DefaultThinking({ effective, onChange }: { effective: EffectiveModel; onChange: (level: ThinkingLevel) => void }) {
  const levels = effective.thinking?.levels ?? null;
  if (!levels || levels.length === 0) {
    return <Select value="" options={[]} onValueChange={() => undefined} disabled ariaLabel="默认思考" placeholder={levels ? "不支持思考" : "先在「显示更多」里勾档位"} className="w-full" />;
  }
  return (
    <Select
      value={effective.thinking?.default ?? ""}
      options={levels.map((level) => ({ value: level, label: levelName(levels, level) }))}
      onValueChange={(next) => onChange(next as ThinkingLevel)}
      ariaLabel="默认思考"
      className="w-full"
    />
  );
}

/**
 * 输入 / 输出价格一起提交：两格都填了才保存，两格都清空就回到目录价。只填了一格时先留着，另一格标红。
 * 显示的是已经乘过倍率的价格；手填的就是实际价格。
 */
function RatePair({ rates, onCommit }: { rates: ModelRates | null; onCommit: (rates: ModelRates | null) => void }) {
  const initial = { input: formatRateInput(rates?.input), output: formatRateInput(rates?.output) };
  const [text, setText] = useState(initial);
  useEffect(() => setText(initial), [initial.input, initial.output]);
  const commit = () => {
    if (text.input === initial.input && text.output === initial.output) return;
    const input = parseRate(text.input);
    const output = parseRate(text.output);
    if (input === undefined || output === undefined) return setText(initial);
    if (input === null && output === null) return onCommit(null);
    if (input === null || output === null) return;
    onCommit({ input, output, cacheRead: rates?.cacheRead ?? null, cacheWrite: rates?.cacheWrite ?? null });
  };
  const half = Boolean(text.input.trim()) !== Boolean(text.output.trim());
  const box = (field: "input" | "output", unit: string, label: string) => (
    <UnitBox unit={unit}>
      <SettingsInput
        width="full"
        value={text[field]}
        placeholder="$"
        inputMode="decimal"
        aria-label={label}
        invalid={half && !text[field].trim()}
        className={cx("tabular-nums", unitPad(unit))}
        onChange={(event) => setText((current) => ({ ...current, [field]: event.target.value }))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          if (event.key === "Escape") { event.stopPropagation(); setText(initial); }
        }}
      />
    </UnitBox>
  );
  return (
    <span className="flex gap-1.5">
      {box("input", "入", "输入价格")}
      {box("output", "出", "输出价格")}
    </span>
  );
}

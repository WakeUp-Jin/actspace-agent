import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Minus, Plus, RotateCcw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Menu, MenuCheckboxItem, MenuContent, MenuItem, MenuTrigger } from "../ui/Menu";
import { SELECT_TRIGGER_CLASS, Select, type SelectOption } from "../ui/Select";

/**
 * 设置页通用展示原子组件。样式所有权：这些组件只负责"长什么样"，
 * 业务状态由调用方（各分区）持有，遵循 frontend-style-scope-conventions。
 * 视觉契约见 docs/exec-plans/active/20260925-settings-visual-redesign.md「设计契约」。
 */

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------- 页面与分组 */

/**
 * 设置页外壳。不传 title 时不画页头，由内容自己渲染 PageHeader（例如「模型」页的
 * 二级路由要把返回箭头放进标题行）。
 */
export function PageShell({
  title,
  description,
  width = "default",
  children,
}: {
  title?: string;
  description?: string;
  width?: "default" | "wide";
  children: ReactNode;
}) {
  return (
    <div className={cx("mx-auto w-full px-12 pb-24 pt-9 max-[600px]:px-4 max-[600px]:pb-16 max-[600px]:pt-6", width === "wide" ? "max-w-[928px]" : "max-w-[736px]")}>
      {title ? <PageHeader title={title} description={description} /> : null}
      <div className={cx("flex min-w-0 flex-col gap-9 max-[600px]:gap-7", title && "mt-9 max-[600px]:mt-6")}>{children}</div>
    </div>
  );
}

/**
 * 页面标题。二级页传 onBack：返回箭头和标题同一行、同一层级（macOS 系统设置的做法），
 * 不再在标题上方另放一个小号的返回链接；leading 放服务商 logo 这类身份图标。
 */
export function PageHeader({
  title,
  description,
  onBack,
  backLabel,
  leading,
  tag,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  onBack?: () => void;
  /** 返回目标的名字，生成「返回 X」的 aria-label 和 Tooltip。 */
  backLabel?: string;
  leading?: ReactNode;
  tag?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {onBack ? (
          <IconButton label={backLabel ? `返回${backLabel}` : "返回"} tooltip={backLabel ? `返回${backLabel}` : "返回"} tooltipSide="bottom" className="-ml-2 shrink-0" onClick={onBack}>
            <ChevronLeft size={18} aria-hidden="true" />
          </IconButton>
        ) : null}
        {leading ? <span className="shrink-0 [&>*]:h-10 [&>*]:w-10">{leading}</span> : null}
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="min-w-0 truncate text-act-xl font-semibold leading-tight tracking-tight text-text-main">{title}</h2>
            {tag}
          </div>
          {description ? <div className="flex max-w-[62ch] flex-wrap items-center gap-1 text-act-sm leading-relaxed text-text-muted">{description}</div> : null}
        </div>
      </div>
      {children}
    </header>
  );
}

function GroupHeading({ level, children }: { level: 3 | 4; children: ReactNode }) {
  const className = "text-act-sm font-semibold text-text-main";
  return level === 3 ? <h3 className={className}>{children}</h3> : <h4 className={className}>{children}</h4>;
}

/** 无容器的分组标题 + 内容，用于内容不是设置行的区域（如主题缩略图、表格）。 */
export function SectionShell({
  title,
  description,
  action,
  headingLevel = 3,
  children,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  headingLevel?: 3 | 4;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 w-full flex-col gap-2.5">
      <GroupHeader title={title} description={description} right={action} headingLevel={headingLevel} />
      {children}
    </section>
  );
}

function GroupHeader({
  title,
  description,
  right,
  headingLevel,
}: {
  title?: string;
  description?: ReactNode;
  right?: ReactNode;
  headingLevel: 3 | 4;
}) {
  if (!title && !description && !right) return null;
  return (
    <header className="flex items-end justify-between gap-4 px-0.5 max-[600px]:flex-col max-[600px]:items-start max-[600px]:gap-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        {title ? <GroupHeading level={headingLevel}>{title}</GroupHeading> : null}
        {description ? <p className="max-w-[58ch] text-act-xs leading-relaxed text-text-muted">{description}</p> : null}
      </div>
      {right ? <div className="flex shrink-0 items-center gap-1.5">{right}</div> : null}
    </header>
  );
}

/**
 * 内嵌分组：白底 + 1px 边框 + 10px 圆角，组内行用浅分隔线。
 * plain：不画分组自己的框，行直接贴在调用方给的容器里（模型连接详情用 .mc-models 承接）。
 */
export function SettingGroup({
  title,
  description,
  meta,
  action,
  headingLevel = 4,
  id,
  plain = false,
  children,
}: {
  title?: string;
  description?: ReactNode;
  /** 分组右上角的计数等短信息，例如「6 / 6 已启用」。 */
  meta?: ReactNode;
  /** 分组右上角的动作按钮。 */
  action?: ReactNode;
  headingLevel?: 3 | 4;
  id?: string;
  plain?: boolean;
  children: ReactNode;
}) {
  const right = action ?? (meta ? <span className="whitespace-nowrap text-act-xs text-text-faint">{meta}</span> : null);
  return (
    <section id={id} className="flex min-w-0 flex-col gap-2.5 scroll-mt-8">
      <GroupHeader title={title} description={description} right={right} headingLevel={headingLevel} />
      <div className={plain ? "contents" : "divide-y divide-line/60 overflow-hidden rounded-act-group border border-line bg-surface"}>
        {children}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- 行 */

function rowPadding({ tight, indent }: { tight?: boolean; indent?: boolean }) {
  return cx(
    "pr-4",
    indent ? "pl-9" : "pl-4",
    tight ? "min-h-[44px] py-2" : "min-h-[52px] py-2.5",
  );
}

function RowLabel({
  title,
  description,
  monoDescription,
}: {
  title: ReactNode;
  description?: ReactNode;
  monoDescription?: boolean;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-act-sm font-medium leading-snug text-text-main">{title}</div>
      {description ? (
        <div className={monoDescription ? "mt-0.5 break-all font-mono text-act-xs leading-relaxed text-text-faint" : "mt-0.5 text-act-xs leading-relaxed text-text-muted"}>
          {description}
        </div>
      ) : null}
    </>
  );
}

export function SettingRow({
  title,
  description,
  control,
  align = "center",
  indent = false,
  tight = false,
  disabled = false,
  monoDescription = false,
  leading,
}: {
  title: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  align?: "center" | "start";
  /** 从属于上一行开关的设置，左侧缩进。 */
  indent?: boolean;
  tight?: boolean;
  /** 只负责变灰；控件本身的 disabled 由调用方传入。 */
  disabled?: boolean;
  monoDescription?: boolean;
  leading?: ReactNode;
}) {
  return (
    <div
      aria-disabled={disabled || undefined}
      className={cx(
        "flex justify-between gap-6 max-[600px]:flex-col max-[600px]:items-start max-[600px]:gap-2.5",
        rowPadding({ tight, indent }),
        align === "start" ? "items-start" : "items-center",
      )}
    >
      {leading ? <div className={cx("shrink-0 max-[600px]:hidden", disabled && "opacity-45")}>{leading}</div> : null}
      <div className={cx("min-w-0 flex-1", disabled && "opacity-45")}>
        <RowLabel title={title} description={description} monoDescription={monoDescription} />
      </div>
      {control ? (
        <div className={cx("flex shrink-0 items-center gap-2 max-[600px]:w-full max-[600px]:flex-wrap", disabled && "opacity-45")}>{control}</div>
      ) : null}
    </div>
  );
}

/** 整行可点的行：右侧是当前值和箭头。展开型传 expanded，箭头旋转 90°。 */
export function SettingLinkRow({
  title,
  description,
  value,
  trailing,
  leading,
  onClick,
  expanded,
  ariaLabel,
  controlsId,
  indent = false,
  tight = false,
  disabled = false,
  monoDescription = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  value?: ReactNode;
  /** 值之后、箭头之前的附加内容，例如状态点。 */
  trailing?: ReactNode;
  leading?: ReactNode;
  onClick: () => void;
  expanded?: boolean;
  ariaLabel?: string;
  controlsId?: string;
  indent?: boolean;
  tight?: boolean;
  disabled?: boolean;
  monoDescription?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-expanded={expanded}
      aria-controls={controlsId}
      className={cx(
        "flex w-full items-center gap-4 text-left transition-colors duration-(--motion-fast) hover:bg-hover-overlay focus-visible:bg-hover-overlay focus-visible:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent",
        rowPadding({ tight, indent }),
      )}
    >
      {leading ? <span className={cx("shrink-0", disabled && "opacity-45")}>{leading}</span> : null}
      <span className={cx("block min-w-0 flex-1", disabled && "opacity-45")}>
        <RowLabel title={title} description={description} monoDescription={monoDescription} />
      </span>
      <span className={cx("flex min-w-0 shrink items-center gap-2", disabled && "opacity-45")}>
        {value !== undefined && value !== null ? (
          <span className="min-w-0 max-w-[240px] truncate text-act-sm text-text-muted">{value}</span>
        ) : null}
        {trailing}
        <ChevronRight
          size={14}
          strokeWidth={1.9}
          aria-hidden="true"
          className={cx("shrink-0 text-text-subtle transition-transform duration-(--motion-base)", expanded && "rotate-90")}
        />
      </span>
    </button>
  );
}

export function SettingSubhead({ children, indent = false }: { children: ReactNode; indent?: boolean }) {
  return (
    <div className={cx("bg-surface-subtle pb-1.5 pr-4 pt-2.5 text-act-xxs font-medium text-text-faint", indent ? "pl-9" : "pl-4")}>
      {children}
    </div>
  );
}

/** 行下方的编辑区：内容 + 左侧提示 / 右侧「取消 / 保存」。Esc 取消。 */
export function SettingEditor({
  id,
  children,
  hint,
  error,
  onCancel,
  onSave,
  saving = false,
  saveDisabled = false,
  saveLabel = "保存",
  saveAriaLabel,
}: {
  id?: string;
  children: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  onCancel: () => void;
  onSave: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
  saveLabel?: string;
  saveAriaLabel?: string;
}) {
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !saving) {
      event.stopPropagation();
      onCancel();
    }
  };
  return (
    <div id={id} className="bg-surface-subtle px-4 pb-3.5 pt-3" onKeyDown={onKeyDown}>
      {children}
      <div className="mt-2.5 flex items-center justify-between gap-3 max-[600px]:flex-col max-[600px]:items-start">
        {error ? (
          <span role="alert" className="text-act-xs leading-relaxed text-on-danger">{error}</span>
        ) : (
          <span className="text-act-xs leading-relaxed text-text-faint">{hint}</span>
        )}
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>取消</Button>
          <Button variant="primary" onClick={onSave} disabled={saving || saveDisabled} busy={saving} aria-label={saveAriaLabel}>
            {saving ? "保存中…" : saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 一个页面内同一时间只展开一个行内编辑器。 */
export function useSingleEditor<T extends string>() {
  const [openId, setOpenId] = useState<T | null>(null);
  const open = useCallback((id: T) => setOpenId(id), []);
  const close = useCallback(() => setOpenId(null), []);
  const toggle = useCallback((id: T) => setOpenId((current) => (current === id ? null : id)), []);
  const isOpen = useCallback((id: T) => openId === id, [openId]);
  return { openId, open, close, toggle, isOpen };
}

/* ---------------------------------------------------------------- 状态与标记 */

export type StatusTone = "ok" | "off" | "warn" | "error" | "neutral";

const STATUS_DOT_CLASS: Record<StatusTone, string> = {
  ok: "h-1.5 w-1.5 bg-operational",
  off: "h-[7px] w-[7px] border-[1.5px] border-line-strong",
  warn: "h-1.5 w-1.5 bg-warning",
  error: "h-1.5 w-1.5 bg-danger",
  neutral: "h-1.5 w-1.5 bg-line-strong",
};

export function StatusDot({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-act-xs",
        tone === "warn" ? "text-warning" : tone === "error" ? "text-on-danger" : "text-text-muted",
      )}
    >
      <span aria-hidden="true" data-state={tone} className={cx("shrink-0 rounded-full", STATUS_DOT_CLASS[tone])} />
      {children}
    </span>
  );
}

/** 行说明位置的琥珀色提醒，可带一个跳转动作。 */
export function InlineWarning({
  children,
  actionLabel,
  onAction,
}: {
  children: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-act-xs leading-relaxed text-warning">
      <CircleAlert size={13} strokeWidth={2} aria-hidden="true" className="shrink-0" />
      <span>{children}</span>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onAction();
          }}
          className="rounded-sm underline underline-offset-2 hover:text-on-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/30"
        >
          {actionLabel}
        </button>
      ) : null}
    </span>
  );
}

export function SettingTag({ tone = "neutral", children }: { tone?: "neutral" | "warn" | "ok"; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex h-[18px] shrink-0 items-center rounded-act-xs border px-1.5 text-act-xxs font-medium leading-none",
        tone === "warn" ? "border-transparent bg-warning-soft text-warning"
          : tone === "ok" ? "border-transparent bg-operational-soft text-operational"
            : "border-line/60 bg-surface-subtle text-text-muted",
      )}
    >
      {children}
    </span>
  );
}

/** 分段单选：2–4 个互斥选项。选中项抬起为 surface 底色，其余为中性文字。 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = "default",
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: "default" | "sm";
}) {
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = options.findIndex((option) => option.value === value);
    const next = options[(index + (event.key === "ArrowRight" ? 1 : options.length - 1)) % options.length];
    onChange(next.value);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={ariaLabel} onKeyDown={onKeyDown} className="inline-flex max-w-full rounded-act-sm border border-line bg-surface-subtle p-0.5 max-[600px]:w-full">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            data-value={option.value}
            onClick={() => onChange(option.value)}
            className={cx(
              "whitespace-nowrap rounded-act-xs max-[600px]:min-w-0 max-[600px]:flex-1 font-medium transition-colors duration-(--motion-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/30",
              size === "sm" ? "h-6 px-2.5 text-act-xs" : "h-7 px-3 text-act-sm",
              selected ? "bg-surface text-text-main shadow-act-thumb" : "text-text-muted hover:text-text-main",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- 按钮与输入 */

const INPUT_WIDTH = { sm: "w-[120px]", md: "w-[220px]", full: "w-full" } as const;

export const SettingsInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "width"> & { width?: keyof typeof INPUT_WIDTH; numeric?: boolean; mono?: boolean; invalid?: boolean }
>(function SettingsInput({ width = "md", numeric = false, mono = false, invalid = false, className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      spellCheck={false}
      className={cx(
        "h-[30px] min-w-0 rounded-act-sm border bg-surface px-2.5 text-act-sm text-text-main outline-none transition-colors placeholder:text-text-subtle",
        "hover:border-line-strong focus-visible:border-focus-ring focus-visible:ring-[3px] focus-visible:ring-focus-ring/15",
        "disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-line max-[600px]:w-full",
        invalid ? "border-danger" : "border-line",
        numeric && "text-right tabular-nums",
        mono && "font-mono text-act-xs",
        INPUT_WIDTH[width],
        className,
      )}
      {...rest}
    />
  );
});

export function Toggle({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full transition-[background-color,transform] duration-(--motion-base) active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/30 focus-visible:ring-offset-1",
        checked ? "bg-toggle-on" : "bg-toggle-off",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      <span
        className={cx(
          "inline-block h-3.5 w-3.5 rounded-full bg-white shadow-act-knob transition-transform duration-(--motion-base)",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/* ---------------------------------------------------------------- 浮层菜单 */

// 下拉和菜单都挂到 body，不会被 SettingGroup 的 overflow-hidden 裁切；定位、键盘、Esc、外部点击交给 ui 原语。

export type { SelectOption };

/** 单选下拉。选中项高亮并带勾选；options 带 group 时按组显示小标题。 */
export function SettingsSelect({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
  size = "default",
  placeholder,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  size?: "default" | "sm";
  placeholder?: string;
}) {
  return (
    <Select
      value={value}
      options={options}
      onValueChange={onChange}
      disabled={disabled}
      ariaLabel={ariaLabel}
      placeholder={placeholder}
      className={cx(size === "sm" ? "min-w-[140px]" : "min-w-[216px]", "max-w-[300px] max-[600px]:w-full")}
    />
  );
}

/**
 * 多选下拉。触发器和 SettingsSelect 一样，菜单项是复选框，勾选后不收起（便于连续勾选）。
 * 触发器展示已选标签拼接，空时显示 placeholder。
 */
export function MultiSelect({
  values,
  options,
  onChange,
  disabled = false,
  ariaLabel,
  placeholder = "未选择",
}: {
  values: string[];
  options: SelectOption[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  ariaLabel: string;
  placeholder?: string;
}) {
  const selectedLabels = options.filter((o) => values.includes(o.value)).map((o) => o.label);
  const toggle = (value: string) => {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  };

  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          className={cx(SELECT_TRIGGER_CLASS, "group min-w-[216px] max-w-[260px] max-[600px]:w-full")}
        >
          <span className={cx("truncate", selectedLabels.length === 0 && "text-text-subtle")}>
            {selectedLabels.length === 0 ? placeholder : selectedLabels.join("、")}
          </span>
          <ChevronDown
            size={14}
            strokeWidth={1.9}
            className="shrink-0 text-text-faint transition-transform duration-(--motion-base) group-data-[state=open]:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </button>
      </MenuTrigger>
      <MenuContent align="end" className="max-h-[min(280px,var(--radix-dropdown-menu-content-available-height))] min-w-(--radix-dropdown-menu-trigger-width)">
        {options.map((option) => (
          <MenuCheckboxItem
            key={option.value}
            checked={values.includes(option.value)}
            disabled={option.disabled}
            onCheckedChange={() => toggle(option.value)}
            onSelect={(event) => event.preventDefault()}
          >
            <span className="truncate">{option.label}</span>
          </MenuCheckboxItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

export type SettingsMenuItem = { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean };

/** 「管理」这类按钮打开的动作菜单。 */
export function SettingsMenuButton({
  label,
  ariaLabel,
  items,
  disabled = false,
}: {
  label: ReactNode;
  ariaLabel: string;
  items: SettingsMenuItem[];
  disabled?: boolean;
}) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" aria-label={ariaLabel} disabled={disabled}>
          {label}
        </Button>
      </MenuTrigger>
      <MenuContent align="end" className="min-w-[140px]">
        {items.map((item) => (
          <MenuItem key={item.label} danger={item.danger} disabled={item.disabled} onSelect={item.onSelect}>
            {item.label}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

/* ---------------------------------------------------------------- 数值 */

/**
 * 步进器：（↺）− [值] +。纯展示，状态由调用方持有；越界时禁用对应方向按钮。
 * 传 defaultValue 后，当前值与默认不同时在左侧出现重置按钮（仿 Cursor）。
 */
export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
  ariaLabel,
  defaultValue,
  disabled = false,
}: {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  ariaLabel: string;
  defaultValue?: number;
  disabled?: boolean;
}) {
  const decimals = (String(step).split(".")[1] ?? "").length;
  const roundToStep = (next: number) => Number(Math.min(max, Math.max(min, next)).toFixed(decimals));
  const atMin = disabled || value <= min + 1e-9;
  const atMax = disabled || value >= max - 1e-9;
  const display = format ? format(value) : String(value);
  const canReset = !disabled && defaultValue !== undefined && Math.abs(value - defaultValue) > 1e-9;
  const stepButton = "grid h-full w-7 place-items-center text-text-faint transition-colors hover:text-text-main aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:text-text-faint";

  return (
    <div className="inline-flex items-center gap-1.5">
      {defaultValue !== undefined ? (
        <IconButton
          label={`${ariaLabel}重置`}
          tooltip={`重置 ${ariaLabel}`}
          onClick={() => onChange(defaultValue)}
          className={cx(!canReset && "invisible")}
        >
          <RotateCcw size={13} strokeWidth={2} aria-hidden="true" />
        </IconButton>
      ) : null}
      <div role="group" aria-label={ariaLabel} className={cx("inline-flex h-[30px] items-center rounded-act-sm border border-line bg-surface", disabled && "opacity-55")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`${ariaLabel}减小`}
              aria-disabled={atMin}
              onClick={() => {
                if (atMin) return;
                onChange(roundToStep(value - step));
              }}
              className={cx(stepButton, "rounded-l-act-sm")}
            >
              <Minus size={14} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent>减小 {ariaLabel}</TooltipContent>
        </Tooltip>
        <span className="min-w-[52px] text-center text-act-sm font-medium tabular-nums text-text-main">{display}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`${ariaLabel}增大`}
              aria-disabled={atMax}
              onClick={() => {
                if (atMax) return;
                onChange(roundToStep(value + step));
              }}
              className={cx(stepButton, "rounded-r-act-sm")}
            >
              <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent>增大 {ariaLabel}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 保存提示 */

const SaveNoticeContext = createContext<(text?: string) => void>(() => {});

/** 设置壳内的底部"已保存"提示。只在设置中心使用，成功才提示，失败在出错的行显示。 */
export function SettingsSaveNoticeProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const notify = useCallback((text = "已保存") => {
    window.clearTimeout(timer.current);
    setNotice({ text, id: Date.now() });
    timer.current = window.setTimeout(() => setNotice(null), 1400);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <SaveNoticeContext.Provider value={notify}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className={cx(
          "pointer-events-none fixed bottom-7 left-1/2 z-(--act-z-popover) inline-flex h-[30px] -translate-x-1/2 items-center gap-1.5 rounded-act-md bg-action px-3 text-act-xs font-medium text-on-action shadow-act-popover transition-[opacity,transform] duration-(--motion-base) motion-reduce:transition-none",
          notice ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
      >
        {notice ? (
          <>
            <Check size={13} strokeWidth={2.4} aria-hidden="true" />
            {notice.text}
          </>
        ) : null}
      </div>
    </SaveNoticeContext.Provider>
  );
}

export function useSettingsSaveNotice(): (text?: string) => void {
  return useContext(SaveNoticeContext);
}

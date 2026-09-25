import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronRight, CircleAlert, Loader2, Minus, Plus, RotateCcw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";

/**
 * 设置页通用展示原子组件。样式所有权：这些组件只负责"长什么样"，
 * 业务状态由调用方（各分区）持有，遵循 frontend-style-scope-conventions。
 * 视觉契约见 docs/exec-plans/active/20260925-settings-visual-redesign.md「设计契约」。
 */

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------- 页面与分组 */

export function PageShell({
  title,
  description,
  width = "default",
  children,
}: {
  title: string;
  description?: string;
  width?: "default" | "wide";
  children: ReactNode;
}) {
  return (
    <div className={cx("mx-auto w-full px-12 pb-24 pt-9 max-[600px]:px-4 max-[600px]:pb-16 max-[600px]:pt-6", width === "wide" ? "max-w-[928px]" : "max-w-[736px]")}>
      <header className="flex min-w-0 flex-col gap-1">
        <h2 className="text-[20px] font-semibold leading-tight tracking-tight text-text-main">{title}</h2>
        {description ? <p className="max-w-[62ch] text-[13px] leading-relaxed text-text-muted">{description}</p> : null}
      </header>
      <div className="mt-9 flex min-w-0 flex-col gap-9 max-[600px]:mt-6 max-[600px]:gap-7">{children}</div>
    </div>
  );
}

function GroupHeading({ level, children }: { level: 3 | 4; children: ReactNode }) {
  const className = "text-[13px] font-semibold text-text-main";
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
        {description ? <p className="max-w-[58ch] text-[12px] leading-relaxed text-text-muted">{description}</p> : null}
      </div>
      {right ? <div className="flex shrink-0 items-center gap-1.5">{right}</div> : null}
    </header>
  );
}

/** 内嵌分组：白底 + 1px 边框 + 10px 圆角，组内行用浅分隔线。 */
export function SettingGroup({
  title,
  description,
  meta,
  action,
  headingLevel = 4,
  id,
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
  children: ReactNode;
}) {
  const right = action ?? (meta ? <span className="whitespace-nowrap text-[12px] text-text-faint">{meta}</span> : null);
  return (
    <section id={id} className="flex min-w-0 flex-col gap-2.5 scroll-mt-8">
      <GroupHeader title={title} description={description} right={right} headingLevel={headingLevel} />
      <div className="divide-y divide-line/60 overflow-hidden rounded-[10px] border border-line bg-surface">
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
      <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium leading-snug text-text-main">{title}</div>
      {description ? (
        <div className={monoDescription ? "mt-0.5 break-all font-mono text-[11.5px] leading-relaxed text-text-faint" : "mt-0.5 text-[12px] leading-relaxed text-text-muted"}>
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
        "flex w-full items-center gap-4 text-left transition-colors duration-[120ms] hover:bg-hover-overlay focus-visible:bg-hover-overlay focus-visible:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent",
        rowPadding({ tight, indent }),
      )}
    >
      {leading ? <span className={cx("shrink-0", disabled && "opacity-45")}>{leading}</span> : null}
      <span className={cx("block min-w-0 flex-1", disabled && "opacity-45")}>
        <RowLabel title={title} description={description} monoDescription={monoDescription} />
      </span>
      <span className={cx("flex min-w-0 shrink items-center gap-2", disabled && "opacity-45")}>
        {value !== undefined && value !== null ? (
          <span className="min-w-0 max-w-[240px] truncate text-[13px] text-text-muted">{value}</span>
        ) : null}
        {trailing}
        <ChevronRight
          size={14}
          strokeWidth={1.9}
          aria-hidden="true"
          className={cx("shrink-0 text-text-subtle transition-transform duration-150", expanded && "rotate-90")}
        />
      </span>
    </button>
  );
}

export function SettingSubhead({ children, indent = false }: { children: ReactNode; indent?: boolean }) {
  return (
    <div className={cx("bg-surface-subtle pb-1.5 pr-4 pt-2.5 text-[11px] font-medium text-text-faint", indent ? "pl-9" : "pl-4")}>
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
          <span role="alert" className="text-[12px] leading-relaxed text-on-danger">{error}</span>
        ) : (
          <span className="text-[12px] leading-relaxed text-text-faint">{hint}</span>
        )}
        <div className="flex shrink-0 items-center gap-1.5">
          <SettingsButton variant="quiet" onClick={onCancel} disabled={saving}>取消</SettingsButton>
          <SettingsButton variant="primary" onClick={onSave} disabled={saving || saveDisabled} busy={saving} aria-label={saveAriaLabel}>
            {saving ? "保存中…" : saveLabel}
          </SettingsButton>
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
        "inline-flex items-center gap-1.5 whitespace-nowrap text-[12px]",
        tone === "warn" ? "text-warning" : tone === "error" ? "text-on-danger" : "text-text-muted",
      )}
    >
      <span aria-hidden="true" className={cx("shrink-0 rounded-full", STATUS_DOT_CLASS[tone])} />
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
    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] leading-relaxed text-warning">
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

export function SettingTag({ tone = "neutral", children }: { tone?: "neutral" | "warn"; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex h-[18px] shrink-0 items-center rounded-act-xs border px-1.5 text-[11px] font-medium leading-none",
        tone === "warn" ? "border-transparent bg-warning-soft text-warning" : "border-line/60 bg-surface-subtle text-text-muted",
      )}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-grid h-6 min-w-6 place-items-center rounded-act-sm border border-b-2 border-line bg-surface px-1.5 font-sans text-[12px] font-medium text-text-main">
      {children}
    </kbd>
  );
}

/* ---------------------------------------------------------------- 按钮与输入 */

export type SettingsButtonVariant = "primary" | "secondary" | "quiet" | "danger";

const BUTTON_BASE =
  "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] border text-[12.5px] font-medium transition-[background-color,border-color,color,transform] duration-[120ms] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";

const BUTTON_VARIANT: Record<SettingsButtonVariant, string> = {
  primary: "border-action bg-action text-on-action hover:border-action-hover hover:bg-action-hover",
  secondary: "border-line bg-surface text-text-main hover:border-line-strong",
  quiet: "border-transparent bg-transparent text-text-muted hover:bg-hover-overlay hover:text-text-main",
  danger: "border-line bg-surface text-on-danger hover:border-danger/50 hover:bg-danger-soft",
};

export function settingsButtonClass(variant: SettingsButtonVariant = "secondary", size: "default" | "icon" = "default"): string {
  return cx(BUTTON_BASE, BUTTON_VARIANT[variant], size === "icon" ? "w-7 px-0" : "px-[11px]");
}

export const SettingsButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: SettingsButtonVariant; size?: "default" | "icon"; busy?: boolean }
>(function SettingsButton({ variant = "secondary", size = "default", busy = false, className, children, type = "button", ...rest }, ref) {
  return (
    <button ref={ref} type={type} className={cx(settingsButtonClass(variant, size), className)} {...rest}>
      {busy ? <Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
      {children}
    </button>
  );
});

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
        "h-[30px] min-w-0 rounded-[7px] border bg-surface px-2.5 text-[13px] text-text-main outline-none transition-colors placeholder:text-text-subtle",
        "hover:border-line-strong focus-visible:border-focus-ring focus-visible:ring-[3px] focus-visible:ring-focus-ring/15",
        "disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-line max-[600px]:w-full",
        invalid ? "border-danger" : "border-line",
        numeric && "text-right tabular-nums",
        mono && "font-mono text-[12px]",
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
        "relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full transition-[background-color,transform] duration-150 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/30 focus-visible:ring-offset-1",
        checked ? "bg-operational" : "bg-toggle-off",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      <span
        className={cx(
          "inline-block h-3.5 w-3.5 rounded-full bg-white shadow-[0_1px_2px_rgba(31,45,61,0.25)] transition-transform duration-150",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/* ---------------------------------------------------------------- 浮层菜单 */

/**
 * 以触发器定位的 portal 菜单。菜单渲染到 body 并 fixed 定位，
 * 避开 SettingGroup 的 overflow-hidden 裁切；Esc、外部点击、滚动、缩放时关闭。
 */
function useAnchoredMenu<TMenu extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number; minWidth: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<TMenu>(null);

  const openMenu = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({ top: rect.bottom + 6, right: window.innerWidth - rect.right, minWidth: rect.width });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onReflow = () => setOpen(false);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open]);

  return {
    open,
    close: () => setOpen(false),
    toggle: () => (open ? setOpen(false) : openMenu()),
    triggerRef,
    menuRef,
    style: coords ? { position: "fixed" as const, top: coords.top, right: coords.right, minWidth: coords.minWidth } : undefined,
  };
}

const MENU_SURFACE = "z-[200] max-h-[280px] overflow-auto rounded-[10px] border border-line bg-surface-raised p-1 shadow-act-popover";
const MENU_ITEM = "flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-45";

const TRIGGER_BASE =
  "flex h-[30px] items-center justify-between gap-2 rounded-[7px] border bg-surface pl-2.5 pr-2 text-[13px] text-text-main outline-none transition-colors max-[600px]:w-full";

function triggerState(disabled: boolean, open: boolean) {
  if (disabled) return "cursor-not-allowed border-line opacity-60";
  if (open) return "cursor-pointer border-focus-ring ring-[3px] ring-focus-ring/15";
  return "cursor-pointer border-line hover:border-line-strong focus-visible:border-focus-ring focus-visible:ring-[3px] focus-visible:ring-focus-ring/15";
}

export type SelectOption = { value: string; label: string; disabled?: boolean; group?: string };

/** 自定义下拉选择。选中项高亮并带勾选；options 带 group 时按组显示小标题。 */
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
  const menu = useAnchoredMenu<HTMLUListElement>();
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!menu.open) return;
    const selectedEl = menu.menuRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
      ?? menu.menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
    selectedEl?.focus();
  }, [menu.open]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(menu.menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? Math.min(items.length - 1, index + 1) : Math.max(0, index - 1);
    items[next]?.focus();
  };

  let lastGroup: string | undefined;
  return (
    <>
      <button
        ref={menu.triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={menu.open}
        disabled={disabled}
        onClick={menu.toggle}
        className={cx(TRIGGER_BASE, size === "sm" ? "min-w-[140px]" : "min-w-[216px]", "max-w-[300px]", triggerState(disabled, menu.open))}
      >
        <span className={cx("truncate", !selected && "text-text-subtle")}>{selected?.label ?? placeholder ?? value}</span>
        <ChevronDown
          size={14}
          strokeWidth={1.9}
          className={cx("shrink-0 text-text-faint transition-transform duration-150", menu.open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {menu.open && menu.style
        ? createPortal(
            <ul ref={menu.menuRef} role="listbox" aria-label={ariaLabel} style={menu.style} className={MENU_SURFACE} onKeyDown={onMenuKeyDown}>
              {options.map((option) => {
                const isSelected = option.value === value;
                const showGroup = option.group && option.group !== lastGroup;
                lastGroup = option.group;
                return (
                  <li key={`${option.group ?? ""}:${option.value}`}>
                    {showGroup ? <div className="px-2 pb-1 pt-2 text-[11px] font-medium text-text-faint">{option.group}</div> : null}
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={option.disabled}
                      onClick={() => {
                        onChange(option.value);
                        menu.close();
                        menu.triggerRef.current?.focus();
                      }}
                      className={cx(
                        MENU_ITEM,
                        isSelected ? "bg-selected font-medium text-text-main" : "text-text-main hover:bg-hover-overlay focus-visible:bg-hover-overlay focus-visible:outline-none",
                      )}
                    >
                      <Check size={14} strokeWidth={2.4} className={cx("shrink-0", !isSelected && "opacity-0")} aria-hidden="true" />
                      <span className="truncate">{option.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * 多选下拉。复用 SettingsSelect 的 portal 定位与样式语汇，但菜单项是复选框、
 * 选择后不收起（便于连续勾选）。触发器展示已选标签拼接，空时显示 placeholder。
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
  const menu = useAnchoredMenu<HTMLUListElement>();
  const selectedLabels = options.filter((o) => values.includes(o.value)).map((o) => o.label);
  const toggle = (value: string) => {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  };

  return (
    <>
      <button
        ref={menu.triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={menu.open}
        disabled={disabled}
        onClick={menu.toggle}
        className={cx(TRIGGER_BASE, "min-w-[216px] max-w-[260px]", selectedLabels.length === 0 && "text-text-subtle", triggerState(disabled, menu.open))}
      >
        <span className="truncate">{selectedLabels.length === 0 ? placeholder : selectedLabels.join("、")}</span>
        <ChevronDown
          size={14}
          strokeWidth={1.9}
          className={cx("shrink-0 text-text-faint transition-transform duration-150", menu.open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {menu.open && menu.style
        ? createPortal(
            <ul ref={menu.menuRef} role="listbox" aria-label={ariaLabel} aria-multiselectable="true" style={menu.style} className={MENU_SURFACE}>
              {options.map((option) => {
                const isSelected = values.includes(option.value);
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={option.disabled}
                      onClick={() => toggle(option.value)}
                      className={cx(MENU_ITEM, isSelected ? "bg-selected font-medium text-text-main" : "text-text-main hover:bg-hover-overlay")}
                    >
                      <span className={cx("grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[4px] border border-line-strong", isSelected && "bg-surface")}>
                        <Check size={11} strokeWidth={3} className={isSelected ? "" : "opacity-0"} aria-hidden="true" />
                      </span>
                      <span className="truncate">{option.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </>
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
  const menu = useAnchoredMenu<HTMLDivElement>();
  useEffect(() => {
    if (menu.open) menu.menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [menu.open]);
  return (
    <>
      <button
        ref={menu.triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        disabled={disabled}
        onClick={menu.toggle}
        className={settingsButtonClass("quiet")}
      >
        {label}
      </button>
      {menu.open && menu.style
        ? createPortal(
            <div ref={menu.menuRef} role="menu" aria-label={ariaLabel} style={{ ...menu.style, minWidth: 140 }} className={MENU_SURFACE}>
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    menu.close();
                    item.onSelect();
                  }}
                  className={cx(MENU_ITEM, "hover:bg-hover-overlay focus-visible:bg-hover-overlay focus-visible:outline-none", item.danger ? "text-on-danger" : "text-text-main")}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
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
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`${ariaLabel}重置`}
              onClick={() => onChange(defaultValue)}
              className={cx("grid h-7 w-7 place-items-center rounded-act-sm text-text-faint transition-colors hover:text-text-main", !canReset && "invisible")}
            >
              <RotateCcw size={13} strokeWidth={2} aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent>重置 {ariaLabel}</TooltipContent>
        </Tooltip>
      ) : null}
      <div role="group" aria-label={ariaLabel} className={cx("inline-flex h-[30px] items-center rounded-[7px] border border-line bg-surface", disabled && "opacity-55")}>
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
              className={cx(stepButton, "rounded-l-[7px]")}
            >
              <Minus size={14} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent>减小 {ariaLabel}</TooltipContent>
        </Tooltip>
        <span className="min-w-[52px] text-center text-[13px] font-medium tabular-nums text-text-main">{display}</span>
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
              className={cx(stepButton, "rounded-r-[7px]")}
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

export function NumberField({
  value,
  placeholder,
  onCommit,
  min,
  max,
  step,
  disabled = false,
  ariaLabel,
  suffix,
}: {
  value: number | null;
  placeholder: string;
  onCommit: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  ariaLabel: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <SettingsInput
        type="number"
        aria-label={ariaLabel}
        defaultValue={value ?? ""}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        width="sm"
        numeric
        onBlur={(event) => {
          const raw = event.target.value.trim();
          if (raw === "") {
            onCommit(null);
            return;
          }
          const parsed = Number(raw);
          onCommit(Number.isFinite(parsed) ? parsed : null);
        }}
      />
      {suffix ? <span className="text-[12px] text-text-faint">{suffix}</span> : null}
    </div>
  );
}

/**
 * 受控文本框，commit-on-blur（失焦 / 回车）才回调，未聚焦时随外部 value 同步。
 * 适合「即时生效」表单里的字符串字段（路径、glob、时区、HH:MM、说明）。
 */
export function TextField({
  value,
  placeholder,
  onCommit,
  disabled = false,
  ariaLabel,
  mono = false,
  className,
}: {
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  mono?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  const commit = () => {
    focused.current = false;
    if (draft !== value) onCommit(draft);
  };

  return (
    <SettingsInput
      type="text"
      aria-label={ariaLabel}
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      mono={mono}
      width={className ? undefined : "full"}
      className={className}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
      }}
    />
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
          "pointer-events-none fixed bottom-7 left-1/2 z-[210] inline-flex h-[30px] -translate-x-1/2 items-center gap-1.5 rounded-act-md bg-action px-3 text-[12px] font-medium text-on-action shadow-act-popover transition-[opacity,transform] duration-150 motion-reduce:transition-none",
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

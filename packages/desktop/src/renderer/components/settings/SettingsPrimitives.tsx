import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Minus, Plus, RotateCcw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";

/**
 * 设置页通用展示原子组件。样式所有权：这些组件只负责"长什么样"，
 * 业务状态由调用方（各分区）持有，遵循 frontend-style-scope-conventions。
 */

export function SectionShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-7 px-8 py-8">
      <header className="flex flex-col gap-1">
        <h2 className="text-[22px] font-bold tracking-tight text-text-main">{title}</h2>
        {description ? <p className="text-[13px] leading-relaxed text-text-faint">{description}</p> : null}
      </header>
      {children}
    </div>
  );
}

export function SettingGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      {title ? <h3 className="px-0.5 text-[12px] font-semibold uppercase tracking-wide text-text-faint">{title}</h3> : null}
      <div className="divide-y divide-line/80 overflow-hidden rounded-act-lg border border-line bg-surface">
        {children}
      </div>
    </section>
  );
}

export function SettingRow({
  title,
  description,
  control,
  align = "center",
}: {
  title: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  align?: "center" | "start";
}) {
  return (
    <div className={`flex justify-between gap-5 px-4 py-3.5 ${align === "start" ? "items-start" : "items-center"}`}>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-text-main">{title}</div>
        {description ? <p className="mt-0.5 text-[12px] leading-relaxed text-text-faint">{description}</p> : null}
      </div>
      {control ? <div className="flex shrink-0 items-center">{control}</div> : null}
    </div>
  );
}

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
      className={[
        "relative inline-flex h-[24px] w-[42px] shrink-0 items-center rounded-full transition-colors duration-150",
        checked ? "bg-brand" : "bg-line-strong",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(31,45,61,0.25)] transition-transform duration-150",
          checked ? "translate-x-[21px]" : "translate-x-[3px]",
        ].join(" ")}
      />
    </button>
  );
}

export type SelectOption = { value: string; label: string };

/**
 * 自定义下拉选择。用 portal 渲染菜单到 body 并按触发器位置 fixed 定位，
 * 避开 SettingGroup 的 overflow-hidden 裁切；选中项高亮并带勾选。
 */
export function SettingsSelect({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number; minWidth: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const selected = options.find((option) => option.value === value);

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
      if (event.key === "Escape") setOpen(false);
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

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={[
          "flex h-9 min-w-[180px] items-center justify-between gap-2 rounded-act-md border bg-surface pl-3 pr-2.5 text-[13px] font-medium text-text-main outline-none transition-colors",
          disabled
            ? "cursor-not-allowed border-line opacity-60"
            : open
              ? "cursor-pointer border-brand"
              : "cursor-pointer border-line hover:border-brand/40",
        ].join(" ")}
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <ChevronDown
          size={15}
          strokeWidth={1.9}
          className={`shrink-0 text-text-faint transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && coords
        ? createPortal(
            <ul
              ref={menuRef}
              role="listbox"
              aria-label={ariaLabel}
              style={{ position: "fixed", top: coords.top, right: coords.right, minWidth: coords.minWidth }}
              className="z-[200] max-h-[280px] overflow-auto rounded-[10px] border border-line bg-surface-raised p-1 shadow-act-popover"
            >
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                      className={[
                        "flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left text-[13px] transition-colors",
                        isSelected
                          ? "bg-brand font-semibold text-white"
                          : "font-medium text-text-main hover:bg-[var(--act-color-hover-overlay)]",
                      ].join(" ")}
                    >
                      <Check
                        size={14}
                        strokeWidth={2.6}
                        className={isSelected ? "shrink-0" : "shrink-0 opacity-0"}
                        aria-hidden="true"
                      />
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
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number; minWidth: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const selectedLabels = options.filter((o) => values.includes(o.value)).map((o) => o.label);

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
      if (event.key === "Escape") setOpen(false);
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

  const toggle = (value: string) => {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={[
          "flex h-9 min-w-[180px] max-w-[240px] items-center justify-between gap-2 rounded-act-md border bg-surface pl-3 pr-2.5 text-[13px] font-medium outline-none transition-colors",
          selectedLabels.length === 0 ? "text-text-faint" : "text-text-main",
          disabled
            ? "cursor-not-allowed border-line opacity-60"
            : open
              ? "cursor-pointer border-brand"
              : "cursor-pointer border-line hover:border-brand/40",
        ].join(" ")}
      >
        <span className="truncate">
          {selectedLabels.length === 0 ? placeholder : selectedLabels.join("、")}
        </span>
        <ChevronDown
          size={15}
          strokeWidth={1.9}
          className={`shrink-0 text-text-faint transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && coords
        ? createPortal(
            <ul
              ref={menuRef}
              role="listbox"
              aria-label={ariaLabel}
              aria-multiselectable="true"
              style={{ position: "fixed", top: coords.top, right: coords.right, minWidth: coords.minWidth }}
              className="z-[200] max-h-[280px] overflow-auto rounded-[10px] border border-line bg-surface-raised p-1 shadow-act-popover"
            >
              {options.map((option) => {
                const isSelected = values.includes(option.value);
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => toggle(option.value)}
                      className={[
                        "flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left text-[13px] transition-colors",
                        isSelected
                          ? "bg-brand font-semibold text-white"
                          : "font-medium text-text-main hover:bg-[var(--act-color-hover-overlay)]",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[4px] border",
                          isSelected ? "border-white/80 bg-white/15" : "border-line-strong",
                        ].join(" ")}
                      >
                        <Check
                          size={11}
                          strokeWidth={3}
                          className={isSelected ? "" : "opacity-0"}
                          aria-hidden="true"
                        />
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
}: {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  ariaLabel: string;
  defaultValue?: number;
}) {
  const decimals = (String(step).split(".")[1] ?? "").length;
  const roundToStep = (next: number) => Number(Math.min(max, Math.max(min, next)).toFixed(decimals));
  const atMin = value <= min + 1e-9;
  const atMax = value >= max - 1e-9;
  const display = format ? format(value) : String(value);
  const canReset = defaultValue !== undefined && Math.abs(value - defaultValue) > 1e-9;

  return (
    <div className="inline-flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`${ariaLabel}重置`}
            onClick={() => defaultValue !== undefined && onChange(defaultValue)}
            className={`grid h-7 w-7 place-items-center rounded-act-sm text-text-faint transition-colors hover:text-text-main ${canReset ? "" : "invisible"}`}
          >
            <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent>重置 {ariaLabel}</TooltipContent>
      </Tooltip>
      <div
        role="group"
        aria-label={ariaLabel}
        className="inline-flex h-9 items-center rounded-act-md border border-line bg-surface"
      >
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
              className="grid h-full w-9 place-items-center rounded-l-act-md text-text-faint transition-colors hover:text-text-main aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
            >
              <Minus size={15} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent>减小 {ariaLabel}</TooltipContent>
        </Tooltip>
        <span className="min-w-[60px] text-center text-[13px] font-semibold tabular-nums text-text-main">
          {display}
        </span>
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
              className="grid h-full w-9 place-items-center rounded-r-act-md text-text-faint transition-colors hover:text-text-main aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
            >
              <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
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
      <input
        type="number"
        aria-label={ariaLabel}
        defaultValue={value ?? ""}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onBlur={(event) => {
          const raw = event.target.value.trim();
          if (raw === "") {
            onCommit(null);
            return;
          }
          const parsed = Number(raw);
          onCommit(Number.isFinite(parsed) ? parsed : null);
        }}
        className={[
          "h-9 w-[120px] rounded-act-md border border-line bg-surface px-3 text-right text-[13px] font-medium tabular-nums text-text-main outline-none transition-colors",
          disabled ? "cursor-not-allowed opacity-60" : "hover:border-brand/40 focus-visible:border-brand",
        ].join(" ")}
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
    <input
      type="text"
      aria-label={ariaLabel}
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      spellCheck={false}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
      }}
      className={[
        "h-9 rounded-act-md border border-line bg-surface px-3 text-[13px] text-text-main outline-none transition-colors",
        mono ? "font-mono" : "font-medium",
        disabled ? "cursor-not-allowed opacity-60" : "hover:border-brand/40 focus-visible:border-brand",
        className ?? "w-full",
      ].join(" ")}
    />
  );
}

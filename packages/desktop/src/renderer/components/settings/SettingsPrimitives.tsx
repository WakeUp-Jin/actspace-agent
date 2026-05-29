import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

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
      <div className="divide-y divide-line/80 overflow-hidden rounded-act-lg border border-line bg-white">
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
  control: ReactNode;
  align?: "center" | "start";
}) {
  return (
    <div className={`flex justify-between gap-5 px-4 py-3.5 ${align === "start" ? "items-start" : "items-center"}`}>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-text-main">{title}</div>
        {description ? <p className="mt-0.5 text-[12px] leading-relaxed text-text-faint">{description}</p> : null}
      </div>
      <div className="flex shrink-0 items-center">{control}</div>
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
        checked ? "bg-brand" : "bg-[#d3d8e0]",
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
          "flex h-9 min-w-[180px] items-center justify-between gap-2 rounded-act-md border bg-white pl-3 pr-2.5 text-[13px] font-medium text-text-main outline-none transition-colors",
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
              className="z-[200] max-h-[280px] overflow-auto rounded-[10px] border border-line bg-white p-1 shadow-[0_14px_40px_rgba(31,45,61,0.18)]"
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
                          : "font-medium text-text-main hover:bg-[rgba(32,33,36,0.05)]",
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
          "h-9 w-[120px] rounded-act-md border border-line bg-white px-3 text-right text-[13px] font-medium tabular-nums text-text-main outline-none transition-colors",
          disabled ? "cursor-not-allowed opacity-60" : "hover:border-brand/40 focus-visible:border-brand",
        ].join(" ")}
      />
      {suffix ? <span className="text-[12px] text-text-faint">{suffix}</span> : null}
    </div>
  );
}

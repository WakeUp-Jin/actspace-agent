import { cx } from "./cx";

/** 分段控件（单选）。样式 .seg 在 styles/list.css；compact 是设置行右侧的小号。 */
export function Segmented<T extends string>({ value, options, onChange, label, className, compact = false }: { readonly value: T; readonly options: readonly { readonly value: T; readonly label: string }[]; readonly onChange: (value: T) => void; readonly label: string; readonly className?: string; readonly compact?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("seg", className)}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cx("flex-1 whitespace-nowrap rounded-act-sm text-text-muted transition-colors duration-(--motion-fast)", compact ? "h-7 px-2.5 text-act-sm" : "min-h-9 px-3.5 text-act-md")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

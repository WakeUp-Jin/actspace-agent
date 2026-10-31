import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "./cn";
import { MENU_ITEM_CLASS, MENU_LABEL_CLASS, MENU_SURFACE_CLASS } from "./menu-styles";

// 单选下拉。键盘：焦点在触发器上时 ↑↓ / Enter / 空格打开，打开后 ↑↓ 移动、Enter 选中、字母跳转、Esc 关闭；
// 关闭后焦点回到触发器。触发器外观取自迁移前的 SettingsSelect；宽度由调用方用 className 给。
// options 带 group 时，相邻同组的项归到一个分组下，显示组名。

export type SelectOption = { value: string; label: string; disabled?: boolean; group?: string };

// Radix 不允许 Item 的 value 是空串（空串表示「未选择」）。业务里「默认 / 不指定」常用空串，这里换一个占位值。
const EMPTY_VALUE = "\u0000empty";
const toRadix = (value: string) => (value === "" ? EMPTY_VALUE : value);
const fromRadix = (value: string) => (value === EMPTY_VALUE ? "" : value);

export const SELECT_TRIGGER_CLASS =
  "flex h-[30px] items-center justify-between gap-2 rounded-act-sm border border-line bg-surface pl-2.5 pr-2 text-act-sm text-text-main outline-none transition-colors " +
  "enabled:cursor-pointer enabled:hover:border-line-strong focus-visible:border-focus-ring focus-visible:ring-[3px] focus-visible:ring-focus-ring/15 " +
  "data-[state=open]:border-focus-ring data-[state=open]:ring-[3px] data-[state=open]:ring-focus-ring/15 disabled:cursor-not-allowed disabled:opacity-60";

function groupOptions(options: SelectOption[]) {
  const groups: Array<{ group?: string; options: SelectOption[] }> = [];
  for (const option of options) {
    const last = groups[groups.length - 1];
    if (last && last.group === option.group) last.options.push(option);
    else groups.push({ group: option.group, options: [option] });
  }
  return groups;
}

export function Select({
  value, onValueChange, options, placeholder, disabled = false, ariaLabel, className, contentClassName, wrapOptions = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  /** 当前值不在 options 里时显示；不给时显示值本身。 */
  placeholder?: string;
  disabled?: boolean;
  ariaLabel: string;
  /** 触发器的布局类（宽度、外边距）。 */
  className?: string;
  contentClassName?: string;
  /** 长路径等必须全文可读的选项，在受限弹层宽度内换行。 */
  wrapOptions?: boolean;
}) {
  const selected = options.find((option) => option.value === value);
  return (
    <SelectPrimitive.Root value={toRadix(value)} onValueChange={(next) => onValueChange(fromRadix(next))} disabled={disabled}>
      <SelectPrimitive.Trigger aria-label={ariaLabel} className={cn(SELECT_TRIGGER_CLASS, "group", className)}>
        <span className={cn("truncate", !selected && "text-text-subtle")}>
          <SelectPrimitive.Value>{selected?.label ?? placeholder ?? value}</SelectPrimitive.Value>
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown size={14} strokeWidth={1.9} aria-hidden="true"
            className="shrink-0 text-text-faint transition-transform duration-(--motion-base) group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={6} collisionPadding={8} aria-label={ariaLabel}
          // 和 Menu 一样：Esc 只收起下拉，不冒泡到外层表单的 Esc（返回上一步、取消编辑）。
          onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }}
          className={cn(MENU_SURFACE_CLASS, "max-h-[min(280px,var(--radix-select-content-available-height))] min-w-(--radix-select-trigger-width) overflow-hidden", contentClassName)}>
          <SelectPrimitive.Viewport>
            {groupOptions(options).map((entry, index) => (
              <SelectPrimitive.Group key={`${entry.group ?? ""}:${index}`}>
                {entry.group ? <SelectPrimitive.Label className={MENU_LABEL_CLASS}>{entry.group}</SelectPrimitive.Label> : null}
                {entry.options.map((option) => (
                  <SelectPrimitive.Item key={option.value} value={toRadix(option.value)} disabled={option.disabled}
                    className={cn(MENU_ITEM_CLASS, "data-[state=checked]:bg-selected data-[state=checked]:font-medium")}>
                    <SelectPrimitive.ItemIndicator className="shrink-0"><Check size={14} strokeWidth={2.4} aria-hidden="true" /></SelectPrimitive.ItemIndicator>
                    {option.value === value ? null : <span className="w-[14px] shrink-0" aria-hidden="true" />}
                    {wrapOptions ? <span className="min-w-0 whitespace-normal break-all py-1">
                      <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                    </span> : <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>}
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Group>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

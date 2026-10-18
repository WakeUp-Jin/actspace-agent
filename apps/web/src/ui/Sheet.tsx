import * as Dialog from "@radix-ui/react-dialog";
import { Check, X } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useWide } from "../app/use-wide";
import { cx } from "./cx";
import { IconButton } from "./IconButton";

export type SheetProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  /** 标题栏右侧的动作；不给时是关闭按钮。 */
  readonly action?: ReactNode;
  readonly children: ReactNode;
};

/**
 * 窄屏是底部玻璃弹层（拖动条、顶部圆角 18）；宽屏是居中对话框（宽 420px）。
 * 基于 Radix Dialog：Esc 只关最上层，关闭后焦点回到触发按钮。
 */
export function Sheet({ open, onOpenChange, title, description, action, children }: SheetProps) {
  const wide = useWide();
  // 受控用法没有 Dialog.Trigger，Radix 不知道焦点该回哪；打开前记下当时的焦点，关闭后还回去。
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-fade fixed inset-0 z-(--act-z-modal) bg-overlay" />
        <Dialog.Content
          onCloseAutoFocus={event => { event.preventDefault(); returnFocus.current?.focus(); }}
          className={cx(
            "glass-sheet fixed z-(--act-z-modal) flex max-h-[86dvh] flex-col overflow-hidden px-4 text-text-main shadow-act-float outline-none",
            wide ? "anim-dialog left-1/2 top-1/2 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-act-xl pb-4 pt-2" : "anim-sheet inset-x-0 bottom-0 rounded-t-act-xl pb-[max(20px,env(safe-area-inset-bottom))] pt-2",
          )}
        >
          {!wide && <div aria-hidden className="mx-auto mb-1.5 h-[5px] w-9 flex-none rounded-act-pill bg-line" />}
          <div className="flex h-10 flex-none items-center justify-between gap-3">
            <Dialog.Title className="m-0 text-act-lg font-semibold">{title}</Dialog.Title>
            {action ?? <IconButton label="关闭" size="sm" tone="faint" onClick={() => onOpenChange(false)}><X size={18} aria-hidden /></IconButton>}
          </div>
          {description ? <Dialog.Description className="m-0 pb-1 text-act-sm leading-relaxed text-text-muted">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
          <div className="no-scrollbar -mx-4 min-h-0 flex-1 overflow-y-auto px-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export type OptionTone = "plain" | "plan" | "chat";
const TILE_TONES: Record<OptionTone, string> = { plain: "bg-surface-subtle text-text-muted", plan: "bg-warning-soft text-on-warning", chat: "bg-operational-soft text-operational" };

/** 弹层里的单选行：可选 32px 图标块、标题、说明，选中时右侧主色勾。 */
export function SheetOption({ selected, title, detail, icon, tone = "plain", onSelect, disabled = false }: { readonly selected: boolean; readonly title: ReactNode; readonly detail?: ReactNode; readonly icon?: ReactNode; readonly tone?: OptionTone; readonly onSelect: () => void; readonly disabled?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cx("flex w-full items-center gap-3 rounded-act-md px-2.5 text-left transition-colors duration-(--motion-fast) hover:bg-hover-overlay active:bg-hover-overlay disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent", detail || icon ? "min-h-[54px] py-2" : "min-h-11")}
    >
      {icon ? <span aria-hidden className={cx("grid size-8 flex-none place-items-center rounded-act-md", TILE_TONES[tone])}>{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className={cx("block truncate text-act-base", (detail || icon) ? "font-medium" : undefined)}>{title}</span>
        {detail ? <span className="block text-act-xs text-text-faint">{detail}</span> : null}
      </span>
      {selected ? <Check size={18} aria-hidden className="flex-none text-accent" /> : null}
    </button>
  );
}

export function SheetGroupLabel({ children }: { readonly children: ReactNode }) {
  return <div className="flex items-center gap-1.5 px-1 pb-1.5 pt-3 text-act-xs font-medium text-text-faint">{children}</div>;
}

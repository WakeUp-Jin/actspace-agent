import { ChevronDown } from "lucide-react";
import { Pressable } from "../../ui/Pressable";
import { cx } from "../../ui/cx";

/** 列表底部「已归档 N」分组标题，点开展开。 */
export function ArchivedToggle({ count, open, onToggle }: { readonly count: number; readonly open: boolean; readonly onToggle: () => void }) {
  return (
    <Pressable onClick={onToggle} aria-expanded={open} className="mt-3.5 flex min-h-8 items-center gap-1 rounded-act-md px-5 text-act-xs font-medium text-text-faint active:bg-transparent">
      已归档 {count}<ChevronDown size={13} aria-hidden className={cx("transition-transform duration-(--motion-fast)", !open && "-rotate-90")} />
    </Pressable>
  );
}

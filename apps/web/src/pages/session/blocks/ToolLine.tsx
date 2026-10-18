import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Pressable } from "../../../ui/Pressable";
import { cx } from "../../../ui/cx";

export type ToolLineProps = {
  /** 英文动作（Read / Ran / Running…），和桌面端一致；编辑 / 写入保持中文。 */
  readonly verb: ReactNode;
  readonly target?: ReactNode;
  /** 动作后面紧跟的内容（+N -N、徽标等）。 */
  readonly extra?: ReactNode;
  readonly running?: boolean;
  readonly error?: boolean;
  /** 给了就能点开：右侧箭头，children 是展开内容。 */
  readonly open?: boolean;
  readonly onToggle?: () => void;
  /** 目标是否撑满整行（Bash 命令后面跟徽标时）。 */
  readonly grow?: boolean;
  readonly title?: string;
  readonly children?: ReactNode;
};

/** 过程行：无图标，动作 + 浅色目标；进行中动作扫光，失败变红。 */
export function ToolLine({ verb, target, extra, running = false, error = false, open, onToggle, grow = false, title, children }: ToolLineProps) {
  const content = (
    <>
      <span className={cx("tl-verb", running && "shimmer-text")}>{verb}</span>
      {target ? <span className={cx("tl-target", grow && "flex-1")} title={title}>{target}</span> : null}
      {extra}
      {onToggle ? <ChevronRight size={14} aria-hidden className={cx("transition-transform duration-(--motion-fast)", open && "rotate-90")} /> : null}
    </>
  );
  return (
    <div>
      {onToggle ? (
        <Pressable className="tl flex rounded-act-xs active:bg-transparent" data-error={error || undefined} aria-expanded={open} onClick={onToggle}>{content}</Pressable>
      ) : (
        <div className="tl" data-error={error || undefined}>{content}</div>
      )}
      {open ? children : null}
    </div>
  );
}

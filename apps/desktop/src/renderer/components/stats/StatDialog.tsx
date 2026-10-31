import type { LucideIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";

/**
 * 统计弹窗的内容：标题行（图标 + 名称，右侧总数）、分隔线、两列明细。
 * 输入框状态栏的会话胶囊和回复尾部的本轮用量胶囊共用，样式照 DeepSeek Harness 的 `stat-dialog.module.css`。
 */

export type StatRow = readonly [label: string, value: ReactNode];

export type StatDialog = {
  readonly title: string;
  readonly titleValue?: string;
  /** 分隔线下、明细上的口径说明。 */
  readonly description?: string;
  readonly rows: readonly StatRow[];
  /** 明细下的补充口径，例如缓存命中的算法。 */
  readonly footnote?: string;
};

/** 交给 PopoverContent 的 className：宽度随最长一行，夹在 300–440px 之间。 */
export const STAT_DIALOG_CONTENT_CLASS =
  "w-max min-w-[min(300px,calc(100vw-24px))] max-w-[min(440px,calc(100vw-24px))] p-4 text-act-xs leading-[18px]";

/** 明细值后面跟的次要说明，例如「（其中推理 …）」「预估」。 */
export const STAT_NOTE_CLASS = "whitespace-nowrap text-text-faint";

export function StatDialogBody({ icon: Icon, dialog }: { icon: LucideIcon; dialog: StatDialog }): ReactNode {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 font-semibold text-text-muted">
          <Icon className="shrink-0 self-center" size={14} strokeWidth={1.75} aria-hidden="true" />
          {dialog.title}
        </span>
        {dialog.titleValue ? <span className="font-semibold text-text-main tabular-nums">{dialog.titleValue}</span> : null}
      </div>
      <div className="mt-2 mb-2.5 h-px bg-line" aria-hidden="true" />
      {dialog.description ? <p className="m-0 mb-2.5 text-text-faint">{dialog.description}</p> : null}
      <dl className="m-0 grid grid-cols-[minmax(76px,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5">
        {dialog.rows.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-text-muted">{label}</dt>
            <dd className="m-0 min-w-0 text-right text-text-main tabular-nums [overflow-wrap:anywhere]">{value}</dd>
          </Fragment>
        ))}
      </dl>
      {dialog.footnote ? <p className="m-0 mt-2.5 text-text-faint">{dialog.footnote}</p> : null}
    </>
  );
}

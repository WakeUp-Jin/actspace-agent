import { Pressable } from "../../ui/Pressable";
import { cx } from "../../ui/cx";
import type { RowStatus } from "../../sessions/session-row-model";

export type SessionRowProps = {
  readonly title: string;
  readonly workspace: { readonly id: string; readonly name: string };
  readonly time: string;
  readonly status: RowStatus;
  readonly selected: boolean;
  readonly archived: boolean;
  readonly onOpen: () => void;
};

const STATUS_LABEL: Partial<Record<RowStatus, string>> = { approval: "等待审批", running: "运行中", unread: "未读" };

/** 单行会话：状态位 · 标题 + 工作区 · 时间（等审批时显示「待审批」）。分组内发丝线从标题起。 */
export function SessionRow({ title, workspace, time, status, selected, archived, onOpen }: SessionRowProps) {
  const hot = status === "approval" || status === "running";
  return (
    <Pressable
      onClick={onOpen}
      aria-current={selected || undefined}
      aria-label={`${title}，${workspace.name}${STATUS_LABEL[status] ? `，${STATUS_LABEL[status]}` : ""}`}
      className={cx("sess-row inset-row grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2 px-3 hover:bg-hover-overlay", selected && "bg-selected", archived && "opacity-55")}
    >
      <span aria-hidden className="grid size-4 place-items-center">
        {status === "approval" ? <span className="pulse-dot size-1.5 rounded-full bg-warning" /> : status === "running" ? <span className="spinner" /> : status === "unread" ? <span className="size-1.5 rounded-full bg-success" /> : null}
      </span>
      <span className="flex min-w-0 items-baseline gap-2">
        <span className={cx("sess-title min-w-0 truncate", status === "unread" ? "font-semibold text-text-main" : hot ? "font-medium text-text-main" : "font-medium text-text-muted")}>{title}</span>
        <span className="sess-meta sess-ws flex-none truncate text-text-faint">{workspace.name}</span>
      </span>
      <span className={cx("sess-meta min-w-6 text-right tabular-nums", status === "approval" ? "font-medium text-warning" : "text-text-faint")}>{status === "approval" ? "待审批" : time}</span>
    </Pressable>
  );
}

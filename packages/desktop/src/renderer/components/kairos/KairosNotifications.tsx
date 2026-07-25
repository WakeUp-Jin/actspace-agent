/**
 * Kairos 通知中心的两视图共用模块（设计见 docs/design-docs/agent-kairos-notifications.md §5）。
 *
 * 形态（2026-07-04 与用户确认）：通知不走浮层，作为内容 tab 挂进两个视图——
 * - KairosPage：详情面板第 4 个 tab「通知」（最终回复 / 工具结果 / 思考过程 / 通知）；
 * - 右侧紧凑视图：「最终回复」区头部的 tab 切换（最终回复 ⇄ 通知）。
 * 未读数以红色徽标挂在 tab 上；点列表条目行内展开详情并标记已读。
 *
 * - `useKairosNotifications`：数据 hook（list 拉取 + push 订阅 + 已读操作）。
 * - `KairosNotificationList`：列表 + 行内展开，两视图共用。
 * - `KairosNotificationTabBadge`：tab 上的未读数徽标。
 *
 * 桥不可用（浏览器 mock）时 hook 返回空数据，调用方按 bridgeAvailable 决定是否渲染。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import type { KairosBridgeApi, KairosNotification } from "@actspace/shared";
import { formatKairosTime } from "../../state/kairosSelectors";
import { MarkdownProse } from "../messages/MarkdownProse";

/** 单条删除的撤销窗口；超时后才真正下发 IPC 删除。 */
const UNDO_WINDOW_MS = 5000;

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function getBridge(): KairosBridgeApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { kairos?: KairosBridgeApi }).kairos;
}

export interface KairosNotificationsStore {
  bridgeAvailable: boolean;
  notifications: KairosNotification[];
  unreadCount: number;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
  /** 单条删除（进入撤销窗口，先本地隐藏，UNDO_WINDOW_MS 后才真正下发 IPC）。 */
  removeOne(id: string): void;
  /** 撤销窗口内待删除的通知；列表组件据此隐藏条目并渲染撤销提示。 */
  pendingRemoval: { id: string; title: string } | null;
  undoRemove(): void;
  /** 批量清理：清除已读 / 清空全部（即时下发，不走撤销窗口）。 */
  clearRead(): Promise<void>;
  clearAll(): Promise<void>;
}

export function useKairosNotifications(): KairosNotificationsStore {
  const [bridge] = useState<KairosBridgeApi | undefined>(() => getBridge());
  const [notifications, setNotifications] = useState<KairosNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingRemoval, setPendingRemoval] = useState<{ id: string; title: string } | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const commitRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!bridge) return;
    let disposed = false;
    void bridge
      .notificationsList()
      .then((res) => {
        if (disposed) return;
        setNotifications(res.notifications);
        setUnreadCount(res.unreadCount);
      })
      .catch(() => {});
    const off = bridge.onNotification((n) => {
      setNotifications((current) => [n, ...current]);
      setUnreadCount((count) => count + 1);
    });
    return () => {
      disposed = true;
      off();
    };
  }, [bridge]);

  // 组件卸载（切走 tab / 关面板）时把撤销窗口内的删除立刻提交，避免"删了又回来"。
  useEffect(() => {
    return () => {
      commitRef.current?.();
    };
  }, []);

  const markRead = useCallback(
    async (id: string) => {
      if (!bridge) return;
      const res = await bridge.notificationsMarkRead({ id });
      setNotifications((current) => current.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadCount(res.unreadCount);
    },
    [bridge],
  );

  const markAllRead = useCallback(async () => {
    if (!bridge) return;
    const res = await bridge.notificationsMarkRead({});
    setNotifications((current) => current.map((n) => (n.read ? n : { ...n, read: true })));
    setUnreadCount(res.unreadCount);
  }, [bridge]);

  const removeOne = useCallback(
    (id: string) => {
      if (!bridge) return;
      // 撤销窗口内又删了第二条：先立刻提交前一条。
      commitRef.current?.();

      const target = notifications.find((n) => n.id === id);
      if (!target) return;
      if (!target.read) setUnreadCount((count) => Math.max(0, count - 1));
      setPendingRemoval({ id, title: target.title });

      const commit = () => {
        if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
        commitRef.current = null;
        setNotifications((current) => current.filter((n) => n.id !== id));
        setPendingRemoval((current) => (current?.id === id ? null : current));
        void bridge
          .notificationsRemove({ id })
          .then((res) => setUnreadCount(res.unreadCount))
          .catch(() => {});
      };
      commitRef.current = commit;
      undoTimerRef.current = window.setTimeout(commit, UNDO_WINDOW_MS);
    },
    [bridge, notifications],
  );

  const undoRemove = useCallback(() => {
    if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    commitRef.current = null;
    setPendingRemoval((current) => {
      if (current) {
        const target = notifications.find((n) => n.id === current.id);
        if (target && !target.read) setUnreadCount((count) => count + 1);
      }
      return null;
    });
  }, [notifications]);

  const clearRead = useCallback(async () => {
    if (!bridge) return;
    commitRef.current?.();
    const res = await bridge.notificationsRemove({ scope: "read" });
    setNotifications((current) => current.filter((n) => !n.read));
    setUnreadCount(res.unreadCount);
  }, [bridge]);

  const clearAll = useCallback(async () => {
    if (!bridge) return;
    commitRef.current?.();
    const res = await bridge.notificationsRemove({ scope: "all" });
    setNotifications([]);
    setPendingRemoval(null);
    setUnreadCount(res.unreadCount);
  }, [bridge]);

  return {
    bridgeAvailable: Boolean(bridge),
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    removeOne,
    pendingRemoval,
    undoRemove,
    clearRead,
    clearAll,
  };
}

/** tab 上的未读徽标；无未读时不渲染。 */
export function KairosNotificationTabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-on-danger-solid"
      data-testid="kairos-notification-badge"
      aria-label={`${count} 条未读通知`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export interface KairosNotificationListProps {
  store: KairosNotificationsStore;
  /** compact = 右侧紧凑视图（字号/留白更小）。 */
  size?: "default" | "compact";
}

/** 通知列表 + 行内展开详情；点未读条目即标记已读；hover 行尾垃圾桶删除（可撤销）。 */
export function KairosNotificationList({ store, size = "default" }: KairosNotificationListProps) {
  const visible = store.notifications.filter((n) => n.id !== store.pendingRemoval?.id);
  if (visible.length === 0 && !store.pendingRemoval) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-center text-text-faint",
          size === "compact" ? "min-h-[72px] text-xs" : "min-h-40 text-[13px]",
        )}
      >
        暂无通知。Kairos 有重要发现时会出现在这里。
      </div>
    );
  }
  return (
    <div>
      <div role="list" aria-label="通知列表">
        {visible.map((n) => (
          <NotificationItem
            key={n.id}
            notification={n}
            size={size}
            onMarkRead={store.markRead}
            onRemove={store.removeOne}
          />
        ))}
      </div>
      {store.pendingRemoval ? (
        <div
          className="mt-2 flex items-center justify-between gap-2 rounded-[8px] bg-text-main px-3 py-2 text-xs text-app-bg"
          role="status"
          data-testid="kairos-notification-undo"
        >
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            已删除「{store.pendingRemoval.title}」
          </span>
          <button
            type="button"
            className="shrink-0 border-0 bg-transparent font-semibold text-action hover:underline"
            onClick={store.undoRemove}
          >
            撤销
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 通知头部操作区：全部已读 + 「清理 ▾」下拉（清除已读 / 清空全部）。
 * 两视图（详情面板通知 tab / 右侧紧凑视图）共用；清空全部用原地二次确认，不弹对话框。
 */
export function KairosNotificationActions({ store }: { store: KairosNotificationsStore }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) setConfirmClearAll(false);
  }, [menuOpen]);

  const actionBtnClass =
    "inline-flex items-center gap-1 rounded-[6px] border-0 bg-transparent px-1.5 py-1 text-xs text-text-faint transition hover:bg-surface-subtle hover:text-text-main disabled:cursor-not-allowed disabled:opacity-50";
  const hasRead = store.notifications.some((n) => n.read);
  const hasAny = store.notifications.length > 0;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={actionBtnClass}
        disabled={store.unreadCount === 0}
        data-testid="kairos-notification-mark-all"
        onClick={() => void store.markAllRead()}
      >
        全部已读
      </button>
      <div className="relative" ref={rootRef}>
        <button
          type="button"
          className={actionBtnClass}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          disabled={!hasAny}
          data-testid="kairos-notification-clear-menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          清理
          <ChevronDown size={12} aria-hidden="true" />
        </button>
        {menuOpen ? (
          <div
            className="absolute right-0 top-[calc(100%+4px)] z-50 grid min-w-[130px] gap-0.5 rounded-[9px] border border-line bg-surface p-1 shadow-[0_10px_28px_rgba(0,0,0,0.16)]"
            role="menu"
            aria-label="清理通知"
          >
            <button
              type="button"
              role="menuitem"
              className="inline-flex h-8 w-full items-center rounded-[6px] border-0 bg-transparent px-2 text-xs text-text-main transition hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!hasRead}
              data-testid="kairos-notification-clear-read"
              onClick={() => {
                setMenuOpen(false);
                void store.clearRead();
              }}
            >
              清除已读
            </button>
            <button
              type="button"
              role="menuitem"
              className={cn(
                "inline-flex h-8 w-full items-center rounded-[6px] border-0 bg-transparent px-2 text-xs transition hover:bg-danger-soft",
                confirmClearAll ? "font-medium text-on-danger" : "text-on-danger/80",
              )}
              data-testid="kairos-notification-clear-all"
              onClick={() => {
                if (!confirmClearAll) {
                  setConfirmClearAll(true);
                  return;
                }
                setMenuOpen(false);
                void store.clearAll();
              }}
            >
              {confirmClearAll ? "确认清空？" : "清空全部…"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function NotificationItem({
  notification: n,
  size,
  onMarkRead,
  onRemove,
}: {
  notification: KairosNotification;
  size: "default" | "compact";
  onMarkRead: (id: string) => Promise<void>;
  onRemove: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const compact = size === "compact";
  const toggle = () => {
    setExpanded((v) => !v);
    if (!n.read) void onMarkRead(n.id);
  };
  // 外层不是 <button>：正文是 Markdown（含链接/代码块，可能需要选中复制），
  // 交互元素嵌套在 button 里是无效 HTML 且链接不可点。键盘可达性靠 tabIndex + Enter/Space。
  return (
    <div
      role="listitem"
      tabIndex={0}
      className={cn(
        "group relative grid w-full cursor-pointer border-b border-line text-left transition last:border-b-0 hover:bg-surface-subtle",
        compact ? "gap-[3px] py-2 pl-0.5 pr-7" : "gap-1 py-2.5 pl-1 pr-8",
        !n.read && "bg-selected/60",
      )}
      data-testid="kairos-notification-item"
      data-read={n.read ? "true" : "false"}
      aria-expanded={expanded}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <button
        type="button"
        className={cn(
          "absolute right-1 top-1.5 hidden h-[22px] w-[22px] items-center justify-center rounded-[6px] border-0 bg-transparent text-text-faint transition hover:bg-danger-soft hover:text-on-danger group-hover:inline-flex focus-visible:inline-flex",
          compact && "right-0.5 top-1",
        )}
        aria-label={`删除通知：${n.title}`}
        title="删除"
        data-testid="kairos-notification-delete"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(n.id);
        }}
      >
        <Trash2 size={13} aria-hidden="true" />
      </button>
      <span className="flex items-center gap-1.5 text-[11px] tabular-nums text-text-faint">
        <i
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            n.level === "important" ? "bg-danger" : "bg-info",
          )}
          aria-hidden="true"
        />
        <time dateTime={n.timestamp}>{formatKairosTime(n.timestamp)}</time>
        {n.level === "important" ? <span className="text-on-danger">重要</span> : null}
        {!n.read ? <span className="font-semibold text-text-main">未读</span> : null}
      </span>
      <span
        className={cn(
          "leading-[1.5] text-text-main",
          compact ? "text-xs" : "text-[13px]",
          !n.read && "font-medium",
        )}
      >
        {n.title}
      </span>
      {expanded && n.body ? (
        <div
          className={cn("break-words text-text-muted", compact ? "text-xs" : "text-[12.5px]")}
          // 正文内点击（选中文本 / 点链接）不应收起条目；收起走头部区域或键盘。
          onClick={(e) => e.stopPropagation()}
        >
          <MarkdownProse content={n.body} />
        </div>
      ) : null}
    </div>
  );
}

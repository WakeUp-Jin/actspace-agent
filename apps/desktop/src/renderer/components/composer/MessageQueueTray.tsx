import { ListOrdered, MoreHorizontal, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { QueuedComposerMessage, SessionMessageQueue } from "../../session/message-queue";
import { Button, cx } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";

/** 上层（App）持有队列；托盘只负责展示和转发操作。 */
export type MessageQueueControls = {
  queue: SessionMessageQueue;
  /** 当前会话有运行中的回合：显示「插入」。 */
  running: boolean;
  /** 正在压缩 / 等待审批时不能插入，给出原因。 */
  steerBlockedReason: string | null;
  onSteer: (id: string) => void;
  onUnsteer: (id: string) => void;
  onRemove: (id: string) => void;
  onMoveUp: (id: string) => void;
  onEdit: (id: string) => void;
  onResume: () => void;
};

const TRAY_CLASS = "composer-message-queue mx-3 mt-3 min-w-0 rounded-act-md border border-line bg-surface-subtle";
const TRAY_HEADER_CLASS = "flex min-h-9 items-center gap-2 pl-3 pr-1 text-act-xs text-text-muted";
const TRAY_LIST_CLASS = "max-h-[156px] overflow-y-auto border-t border-line px-1 pb-0.5";
const ROW_CLASS = "flex min-h-9 items-center gap-1 py-[3px] pl-2 text-act-sm [&+&]:border-t [&+&]:border-line";
const META_CLASS = "shrink-0 whitespace-nowrap px-1 text-act-xs text-text-faint max-[560px]:hidden";
const MENU_CLASS =
  "composer-message-queue-menu fixed z-(--act-z-dropdown) w-40 rounded-act-md border border-line bg-surface-raised p-1 text-act-sm text-text-main shadow-act-popover";
const MENU_ITEM_CLASS =
  "flex h-8 w-full items-center justify-between gap-2 rounded-act-sm px-2 text-left text-text-main transition-[background,color] duration-(--motion-fast) hover:bg-hover-overlay focus-visible:outline-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:text-text-faint disabled:hover:bg-transparent";
const MENU_WIDTH = 160;

const STEER_TIP = "让 Agent 在下一步看到这条消息";

function metaText(item: QueuedComposerMessage): string | null {
  if (item.kind === "compact") return "命令";
  const parts: string[] = [];
  const files = (item.options.attachments?.length ?? 0) + (item.options.fileReferences?.length ?? 0);
  if (files > 0) parts.push(`${files} 个文件`);
  if (item.options.responseAnnotations?.length) parts.push(`${item.options.responseAnnotations.length} 条引用`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function rowText(item: QueuedComposerMessage): string {
  return item.text.trim() || metaText(item) || "（空消息）";
}

/**
 * Composer 顶部的消息队列托盘：运行中发送的消息在这里排队，当前运行结束后依次发出；
 * 「↳ 插入」把一条送进正在运行的回合。已插入、还没被读到的消息排在最上面，可以撤回。
 */
export function MessageQueueTray({ controls, inputEmpty }: { controls: MessageQueueControls; inputEmpty: boolean }) {
  const { queue, running, steerBlockedReason } = controls;
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const anchorsRef = useRef(new Map<string, HTMLButtonElement>());

  const menuItem = menu ? queue.items.find((item) => item.id === menu.id) : undefined;
  useEffect(() => {
    if (menu && !menuItem) setMenu(null);
  }, [menu, menuItem]);

  useEffect(() => {
    if (!menu) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || anchorsRef.current.get(menu.id)?.contains(target)) return;
      setMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      anchorsRef.current.get(menu.id)?.focus();
      setMenu(null);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [menu]);

  // 菜单放不下时翻到按钮上方。
  useLayoutEffect(() => {
    const element = menuRef.current;
    if (!menu || !element) return;
    const anchor = anchorsRef.current.get(menu.id)?.getBoundingClientRect();
    if (!anchor) return;
    const height = element.offsetHeight;
    const below = anchor.bottom + 4;
    const y = below + height > window.innerHeight ? Math.max(8, anchor.top - 4 - height) : below;
    if (y !== menu.y) setMenu({ ...menu, y });
    element.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [menu]);

  if (queue.items.length === 0 && queue.steering.length === 0) return null;

  const counts = [
    queue.items.length > 0 ? `${queue.items.length} 条排队` : null,
    queue.steering.length > 0 ? `${queue.steering.length} 条已插入` : null,
  ].filter(Boolean).join(" · ");
  const hint = queue.paused
    ? "已暂停"
    : queue.items.length === 0
      ? ""
      : running ? "当前运行结束后依次发送" : "即将发送";

  const openMenu = (id: string) => {
    if (menu?.id === id) {
      setMenu(null);
      return;
    }
    const anchor = anchorsRef.current.get(id)?.getBoundingClientRect();
    if (!anchor) return;
    setMenu({
      id,
      x: Math.max(8, Math.min(anchor.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
      y: anchor.bottom + 4,
    });
  };

  const renderSteerButton = (item: QueuedComposerMessage) => {
    if (!running || item.kind !== "message") return null;
    const button = (
      <Button variant="ghost" size="xs" disabled={steerBlockedReason !== null} onClick={() => controls.onSteer(item.id)}>
        ↳ 插入
      </Button>
    );
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* 禁用的按钮收不到悬停事件，外包一层让原因提示仍然可见。 */}
          {steerBlockedReason ? <span className="inline-flex" tabIndex={0}>{button}</span> : button}
        </TooltipTrigger>
        <TooltipContent>{steerBlockedReason ?? STEER_TIP}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <section className={TRAY_CLASS} aria-label="消息队列">
      <div className={TRAY_HEADER_CLASS}>
        <ListOrdered size={14} className="shrink-0 text-text-faint" aria-hidden="true" />
        <span className="shrink-0 font-medium text-text-main">{counts}</span>
        <span className={cx("min-w-0 flex-1 truncate max-[560px]:hidden", queue.paused ? "text-text-main" : "text-text-faint")} role="status">
          {hint}
        </span>
        {queue.paused ? (
          <Button variant="ghost" size="xs" className="ml-auto" onClick={controls.onResume}>继续发送</Button>
        ) : null}
      </div>
      <ul className={TRAY_LIST_CLASS} aria-label="排队的消息">
        {queue.steering.map((item) => (
          <li className={ROW_CLASS} key={item.id} data-state="steering">
            <span className="min-w-0 flex-1 truncate text-text-muted" title={item.text}>{rowText(item)}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-1 text-act-xs text-operational" tabIndex={0}>
                  <i className="size-1.5 rounded-act-pill bg-operational motion-safe:animate-pulse" aria-hidden="true" />
                  下一步读取
                </span>
              </TooltipTrigger>
              <TooltipContent>Agent 开始下一步时会读到这条消息</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="xs" onClick={() => controls.onUnsteer(item.id)}>撤回</Button>
              </TooltipTrigger>
              <TooltipContent>读到之前可以撤回，撤回后回到队列</TooltipContent>
            </Tooltip>
          </li>
        ))}
        {queue.items.map((item, index) => {
          const meta = metaText(item);
          return (
            <li className={ROW_CLASS} key={item.id} data-state="queued">
              <span
                className={cx("min-w-0 flex-1 truncate text-text-main", item.kind === "compact" && "font-mono text-act-xs")}
                title={item.text}
              >
                {rowText(item)}
              </span>
              {meta ? <span className={META_CLASS}>{meta}</span> : null}
              {renderSteerButton(item)}
              <IconButton label={`删除排队消息 ${index + 1}`} tooltip="删除" size="xs" onClick={() => controls.onRemove(item.id)}>
                <Trash2 size={13} strokeWidth={2} aria-hidden="true" />
              </IconButton>
              <IconButton
                ref={(element) => {
                  if (element) anchorsRef.current.set(item.id, element);
                  else anchorsRef.current.delete(item.id);
                }}
                label={`更多操作：排队消息 ${index + 1}`}
                tooltip="更多"
                size="xs"
                aria-haspopup="menu"
                aria-expanded={menu?.id === item.id}
                onClick={() => openMenu(item.id)}
              >
                <MoreHorizontal size={14} strokeWidth={2} aria-hidden="true" />
              </IconButton>
            </li>
          );
        })}
      </ul>
      {menu && menuItem && typeof document !== "undefined" ? createPortal(
        <div ref={menuRef} className={MENU_CLASS} role="menu" aria-label="排队消息操作" style={{ left: menu.x, top: menu.y }}>
          <button
            className={MENU_ITEM_CLASS}
            type="button"
            role="menuitem"
            disabled={!inputEmpty}
            onClick={() => {
              setMenu(null);
              controls.onEdit(menuItem.id);
            }}
          >
            编辑
            {inputEmpty ? null : <small className="text-act-xxs text-text-faint">先清空输入框</small>}
          </button>
          <button
            className={MENU_ITEM_CLASS}
            type="button"
            role="menuitem"
            disabled={queue.items[0]?.id === menuItem.id}
            onClick={() => {
              setMenu(null);
              controls.onMoveUp(menuItem.id);
            }}
          >
            上移
          </button>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}

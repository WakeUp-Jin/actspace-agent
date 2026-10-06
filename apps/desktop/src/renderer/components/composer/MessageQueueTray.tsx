import { ListOrdered, MoreHorizontal, Trash2 } from "lucide-react";
import type { QueuedComposerMessage, SessionMessageQueue } from "../../session/message-queue";
import { Button, cx } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../ui/Menu";
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
              <Menu>
                <MenuTrigger asChild>
                  <IconButton label={`更多操作：排队消息 ${index + 1}`} tooltip="更多" size="xs">
                    <MoreHorizontal size={14} strokeWidth={2} aria-hidden="true" />
                  </IconButton>
                </MenuTrigger>
                <MenuContent align="end" className="w-40">
                  <MenuItem disabled={!inputEmpty} onSelect={() => controls.onEdit(item.id)}>
                    编辑
                    {inputEmpty ? null : <small className="ml-auto text-act-xxs text-text-faint">先清空输入框</small>}
                  </MenuItem>
                  <MenuItem disabled={index === 0} onSelect={() => controls.onMoveUp(item.id)}>上移</MenuItem>
                </MenuContent>
              </Menu>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

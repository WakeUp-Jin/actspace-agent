import { ListOrdered, MoreHorizontal, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { QueuedComposerMessage, SessionMessageQueue } from "../../session/message-queue";
import { Button, cx } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../ui/Menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";

/** 上层（App）持有队列；托盘只负责展示和转发操作。 */
export type MessageQueueControls = {
  queue: SessionMessageQueue;
  /** 当前会话有运行中的回合：显示「引导」。 */
  running: boolean;
  /** 正在压缩 / 等待审批时不能引导，给出原因。 */
  steerBlockedReason: string | null;
  onSteer: (id: string) => void;
  onUnsteer: (id: string) => void;
  onRemove: (id: string) => void;
  onMoveUp: (id: string) => void;
  onEdit: (id: string) => void;
  onResume: () => void;
};

// 托盘在输入框外面、紧贴其上方（09）：与输入框同一套细边，不加阴影；和输入框之间 6px（外层 grid 间距 8px，这里收 2px）。
const TRAY_CLASS = "composer-message-queue -mb-0.5 min-w-0 rounded-act-lg border border-composer bg-surface";
// 最多露出 4 行（每行 36px），再多在托盘里滚动，不把输入框往下推。
const TRAY_LIST_CLASS = "max-h-[144px] overflow-y-auto px-1";
const ROW_CLASS = "group/queue-row flex min-h-9 items-center gap-1 pl-2 text-act-sm [&+&]:border-t [&+&]:border-line";
const ROW_LEAD_CLASS = "inline-grid size-5 shrink-0 place-items-center rounded-act-sm text-text-faint";
// 动作按钮平时淡一些，悬停或键盘进入这一行时变实。
const ROW_ACTIONS_CLASS =
  "flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity duration-(--motion-fast) group-hover/queue-row:opacity-100 group-focus-within/queue-row:opacity-100";
const META_CLASS = "shrink-0 whitespace-nowrap px-1 text-act-xs text-text-faint max-[560px]:hidden";
const PAUSED_ROW_CLASS = "flex min-h-9 items-center gap-2 border-t border-line pl-3 pr-1 text-act-xs text-text-main";
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
 * 「↳ 引导」把一条送进正在运行的回合。已引导、还没被读到的消息排在最上面，可以撤回。
 */
export function MessageQueueTray({ controls, inputEmpty }: { controls: MessageQueueControls; inputEmpty: boolean }) {
  const { queue, running, steerBlockedReason } = controls;
  if (queue.items.length === 0 && queue.steering.length === 0) return null;

  const counts = [
    queue.items.length > 0 ? `${queue.items.length} 条排队` : null,
    queue.steering.length > 0 ? `${queue.steering.length} 条已引导` : null,
  ].filter(Boolean).join(" · ");
  // 原来的标题行去掉了，计数和发送时机放进第一行图标的提示里。
  const hint = queue.paused || queue.items.length === 0 ? null : running ? "当前运行结束后依次发送" : "即将发送";
  const summary = hint ? `${counts}，${hint}` : counts;
  const renderLead = (index: number, icon: ReactNode) => {
    if (index !== 0) return <span className={ROW_LEAD_CLASS} aria-hidden="true">{icon}</span>;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={ROW_LEAD_CLASS} tabIndex={0} role="img" aria-label={summary}>{icon}</span>
        </TooltipTrigger>
        <TooltipContent>{summary}</TooltipContent>
      </Tooltip>
    );
  };

  const renderSteerButton = (item: QueuedComposerMessage) => {
    if (!running || item.kind !== "message") return null;
    const button = (
      <Button variant="ghost" size="xs" disabled={steerBlockedReason !== null} onClick={() => controls.onSteer(item.id)}>
        ↳ 引导
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
      <ul className={TRAY_LIST_CLASS} aria-label="排队的消息">
        {queue.steering.map((item, index) => (
          <li className={ROW_CLASS} key={item.id} data-state="steering">
            {renderLead(index, <i className="size-1.5 rounded-act-pill bg-operational motion-safe:animate-pulse" />)}
            <span className="min-w-0 flex-1 truncate text-text-muted" title={item.text}>{rowText(item)}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex shrink-0 whitespace-nowrap px-1 text-act-xs text-operational" tabIndex={0}>
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
              {renderLead(queue.steering.length + index, <ListOrdered size={14} />)}
              <span
                className={cx("min-w-0 flex-1 truncate text-text-main", item.kind === "compact" && "font-mono text-act-xs")}
                title={item.text}
              >
                {rowText(item)}
              </span>
              {meta ? <span className={META_CLASS}>{meta}</span> : null}
              <span className={ROW_ACTIONS_CLASS}>
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
              </span>
            </li>
          );
        })}
      </ul>
      {queue.paused ? (
        <div className={PAUSED_ROW_CLASS}>
          <span className="min-w-0 flex-1 truncate" role="status">已暂停</span>
          <Button variant="ghost" size="xs" onClick={controls.onResume}>继续发送</Button>
        </div>
      ) : null}
    </section>
  );
}

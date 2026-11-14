import { useContext, useMemo, useState } from "react";
import { Copy, Ellipsis } from "lucide-react";
import { cn } from "../ui/cn";
import { SessionActionsContext } from "../../session/session-actions-context";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../ui/Menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";
import { TurnUsagePill } from "./TurnUsagePill";
import type { AssistantMessageBlock } from "./turns";

// 照 DeepSeek Harness 的回复尾部：操作图标在前，用量胶囊和时间跟在后面。
const TURN_ACTIONS_CLASS =
  "turn-actions mt-1 flex min-h-7 min-w-0 items-center gap-0.5 px-[var(--conversation-text-inset)] text-act-xs text-text-faint";
// 更早的轮次只在悬停或键盘聚焦时出现；最新一轮一直显示。用透明度藏，布局不跳。
const TURN_ACTIONS_HOVER_REVEAL_CLASS =
  "opacity-0 pointer-events-none transition-opacity duration-(--motion-base) ease-in-out group-hover/assistant-turn:pointer-events-auto group-hover/assistant-turn:opacity-100 group-focus-within/assistant-turn:pointer-events-auto group-focus-within/assistant-turn:opacity-100";
const TURN_ACTIONS_END_CLASS = "ml-2 flex min-w-0 items-center gap-2";
const TURN_TIME_CLASS = "whitespace-nowrap tabular-nums";
const TURN_ACTION_TRIGGER_CLASS =
  "turn-action-trigger grid h-[30px] w-[30px] place-items-center rounded-act-md border-0 bg-transparent text-text-faint opacity-65 transition-[background,color,opacity] duration-(--motion-base) ease-in-out hover:bg-hover-overlay hover:text-text-main hover:opacity-100 aria-disabled:cursor-default aria-expanded:bg-selected aria-expanded:text-text-main aria-expanded:opacity-100";
const MESSAGE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : MESSAGE_TIME_FORMATTER.format(date);
}

function copyWithSelection(value: string) {
  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.opacity = "0";

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  document.execCommand("copy");
  textArea.remove();
}

async function copyToClipboard(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      copyWithSelection(value);
    }
  } catch {
    copyWithSelection(value);
  }
}

export function TurnActions({
  assistantMessages,
  sessionId,
  completeTurn,
  revealAlways = false,
  turnActive = false,
}: {
  assistantMessages: AssistantMessageBlock[];
  sessionId: string | null;
  completeTurn: boolean;
  /** 最新一轮且已结束：不等悬停，一直显示。 */
  revealAlways?: boolean;
  /** 这一轮还在运行：不能从它分叉。 */
  turnActive?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const onForkSession = useContext(SessionActionsContext)?.onForkSession;
  const latestAssistantMessage = assistantMessages[assistantMessages.length - 1];
  const copyText = useMemo(() => assistantMessages.map((message) => message.content).join("\n\n"), [assistantMessages]);

  if (!latestAssistantMessage) {
    return null;
  }

  async function handleCopy(value: string) {
    await copyToClipboard(value);
    setMenuOpen(false);
  }

  // 只有已落盘的回复带 turnId；运行中的这一轮和流式块不能分叉。
  const forkTurnId = latestAssistantMessage.turnId;
  const forkDisabled = turnActive || !onForkSession || !sessionId || !forkTurnId;
  const forkLabel = turnActive ? "请等待当前轮次结束后再分叉" : "分叉会话";

  return (
    <div
      className={cn(TURN_ACTIONS_CLASS, !revealAlways && TURN_ACTIONS_HOVER_REVEAL_CLASS)}
      data-turn-actions-reveal={revealAlways ? "always" : "hover"}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={TURN_ACTION_TRIGGER_CLASS}
            type="button"
            aria-label="复制回复"
            onClick={() => void handleCopy(copyText)}
          >
            <Copy size={15} />
          </button>
        </TooltipTrigger>
        <TooltipContent>复制回复</TooltipContent>
      </Tooltip>
      <Menu open={menuOpen} onOpenChange={setMenuOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <MenuTrigger asChild>
              <button className={TURN_ACTION_TRIGGER_CLASS} type="button" aria-label="更多消息操作">
                <Ellipsis size={18} />
              </button>
            </MenuTrigger>
          </TooltipTrigger>
          <TooltipContent>更多操作</TooltipContent>
        </Tooltip>
        <MenuContent side="top" align="start" className="w-[178px]">
          <MenuItem
            disabled={forkDisabled}
            title={forkLabel}
            onSelect={() => {
              if (!forkDisabled) onForkSession(sessionId, forkTurnId);
            }}
          >
            分叉会话
          </MenuItem>
          <MenuItem onSelect={() => void handleCopy(copyText)}>复制消息</MenuItem>
          <MenuItem onSelect={() => void handleCopy(latestAssistantMessage.id)}>复制请求 ID</MenuItem>
        </MenuContent>
      </Menu>
      <span className={TURN_ACTIONS_END_CLASS}>
        {completeTurn ? <TurnUsagePill usage={latestAssistantMessage.usage} /> : null}
        <span
          className={TURN_TIME_CLASS}
          aria-label={`回复时间：${formatMessageTime(latestAssistantMessage.createdAt)}`}
        >
          {formatMessageTime(latestAssistantMessage.createdAt)}
        </span>
      </span>
    </div>
  );
}

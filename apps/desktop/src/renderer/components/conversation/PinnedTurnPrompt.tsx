import { useCallback, useEffect, useState, type RefObject } from "react";
import { cx } from "../ui/Button";
import { getLatestTodoMessage, type ConversationTurn } from "./turns";

// 提问卡片跟着内容滚走；滚出视野后在消息区顶部叠一条一行高的同款卡片（参考 Cursor）。
// 叠加层不占布局，出现、消失都不会推动下面的消息。点它滚回这一轮（可编辑时直接进入编辑）。
const PINNED_LAYER_CLASS = "pointer-events-none absolute inset-x-0 top-0 z-12";
const PINNED_WRAP_CLASS =
  "pointer-events-auto mx-auto bg-[image:var(--act-gradient-surface-fade)] pb-3 pt-2 animate-[fade-in_140ms_ease-out_both]";
const PINNED_CARD_CLASS =
  "overflow-hidden rounded-act-lg border border-line bg-surface shadow-act-popover hover:border-line-strong";
// 整行是一个按钮，左侧文字截断、右侧进度，ui/Button 的固定内边距和居中排版放不下这种布局。
const PINNED_ROW_CLASS =
  "flex w-full min-w-0 cursor-text items-center gap-2.5 py-2 pl-[var(--conversation-card-padding)] pr-3 text-left transition-[border-color] duration-(--motion-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring/30";
const PINNED_TEXT_CLASS = "min-w-0 flex-1 truncate text-act-base leading-5.5 text-text-main";
const PINNED_PROGRESS_CLASS =
  "inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full bg-surface-subtle px-2 text-act-xs tabular-nums text-text-muted";
// 提问卡片底边离开视野这么多像素后才叠精简条；这一轮剩下不到这么高时不再叠，避免盖住下一轮的提问。
const PINNED_REVEAL_OFFSET_PX = 8;
const PINNED_TURN_TAIL_PX = 72;

/** 滚动容器里当前被提问卡片滚出视野的那一轮；按 DOM 顺序二分，长会话也只读几次位置。 */
function findPinnedTurnId(scroller: HTMLElement): string | null {
  const top = scroller.getBoundingClientRect().top;
  const turns = scroller.querySelectorAll<HTMLElement>("[data-conversation-turn-id]");
  let low = 0;
  let high = turns.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (turns[middle].getBoundingClientRect().top <= top + 1) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (found < 0) return null;
  const turn = turns[found];
  const card = turn.querySelector(".turn-prompt-card");
  if (!card || card.getBoundingClientRect().bottom > top + PINNED_REVEAL_OFFSET_PX) return null;
  if (turn.getBoundingClientRect().bottom < top + PINNED_TURN_TAIL_PX) return null;
  return turn.dataset.conversationTurnId ?? null;
}

function oneLine(text: string): string {
  return text.replace(/\s*\n+\s*/g, " ").trim();
}

/**
 * 消息区顶部的一行提问条：提问摘要 + 任务进度（agent-edit-resend-rewind.md §5.3）。
 * 放在滚动容器的定位父元素里，`className` 给出和消息栈相同的宽度。
 */
export function PinnedTurnPrompt({
  scrollRef,
  turns,
  className,
  onJump,
}: {
  scrollRef: RefObject<HTMLElement | null>;
  turns: readonly ConversationTurn[];
  className: string;
  /** 回到这条提问（会话页同时进入编辑）；不给时直接滚到这一轮顶部。 */
  onJump?: (turnId: string) => void;
}) {
  const [pinnedTurnId, setPinnedTurnId] = useState<string | null>(null);

  const update = useCallback(() => {
    const scroller = scrollRef.current;
    setPinnedTurnId(scroller ? findPinnedTurnId(scroller) : null);
  }, [scrollRef]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    scroller.addEventListener("scroll", schedule, { passive: true });
    schedule();
    return () => {
      scroller.removeEventListener("scroll", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [scrollRef, update, turns]);

  const turn = pinnedTurnId ? turns.find((item) => item.id === pinnedTurnId) : undefined;
  const user = turn?.user;
  if (!turn || !user) return null;

  const attachmentCount = user.attachments?.length ?? 0;
  const text = user.content || (attachmentCount > 0 ? `${attachmentCount} 个附件` : "");
  const todo = getLatestTodoMessage(turn.messages);
  const showTodo = Boolean(todo && (todo.totalCount > 0 || todo.status === "failed"));
  const jump = () => {
    setPinnedTurnId(null);
    if (onJump) {
      onJump(turn.id);
      return;
    }
    scrollRef.current
      ?.querySelector(`[data-conversation-turn-id="${CSS.escape(turn.id)}"]`)
      ?.scrollIntoView({ block: "start" });
  };

  return (
    <div className={PINNED_LAYER_CLASS}>
      <div className={cx(PINNED_WRAP_CLASS, className)}>
        <div className={PINNED_CARD_CLASS} data-testid="pinned-turn-prompt">
          <button type="button" className={PINNED_ROW_CLASS} aria-label={`回到提问：${oneLine(text)}`} onClick={jump}>
            <span className={PINNED_TEXT_CLASS}>{oneLine(text)}</span>
            {showTodo && todo ? (
              <span className={PINNED_PROGRESS_CLASS} aria-label={`任务 ${todo.completedCount}/${todo.totalCount}`}>
                <span
                  className="size-3 rounded-full"
                  style={{
                    background: `conic-gradient(var(--color-success) ${todo.totalCount ? (todo.completedCount / todo.totalCount) * 100 : 0}%, var(--color-border) 0)`,
                  }}
                  aria-hidden="true"
                />
                {todo.completedCount}/{todo.totalCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </div>
  );
}

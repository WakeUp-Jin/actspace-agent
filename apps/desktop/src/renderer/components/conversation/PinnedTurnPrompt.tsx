import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { TodoListBlock } from "../messages/TodoListBlock";
import { Button, cx } from "../ui/Button";
import { getLatestTodoMessage, type ConversationTurn } from "./turns";

// 提问卡片跟着内容滚走；滚出视野后在消息区顶部叠一条一行高的同款卡片（参考 Cursor）。
// 叠加层不占布局，出现、消失、展开都不会推动下面的消息。
const PINNED_LAYER_CLASS = "pointer-events-none absolute inset-x-0 top-0 z-12";
const PINNED_WRAP_CLASS =
  "pointer-events-auto mx-auto bg-[image:var(--act-gradient-surface-fade)] pb-3 pt-2 animate-[fade-in_140ms_ease-out_both]";
const PINNED_CARD_CLASS = "overflow-hidden rounded-act-lg border border-line bg-surface shadow-act-popover";
// 整行是一个展开开关，左侧文字截断、右侧进度和箭头，ui/Button 的固定内边距和居中排版放不下这种布局。
const PINNED_ROW_CLASS =
  "flex w-full min-w-0 items-center gap-2.5 py-2 pl-[var(--conversation-card-padding)] pr-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring/30";
const PINNED_TEXT_CLASS = "min-w-0 flex-1 truncate leading-[1.55] text-text-main";
const PINNED_LABEL_CLASS = "min-w-0 flex-1 text-act-sm text-text-faint";
const PINNED_PROGRESS_CLASS =
  "inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full bg-surface-subtle px-2 text-act-xs tabular-nums text-text-muted";
const PINNED_FULL_TEXT_CLASS =
  "max-h-[min(240px,32vh)] overflow-y-auto whitespace-pre-wrap border-t border-line px-[var(--conversation-card-padding)] py-3 leading-[1.55] text-text-main";
const PINNED_FOOTER_CLASS = "flex justify-end border-t border-line px-2 py-1.5";
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
 * 消息区顶部的一行提问条：收起时一行提问 + 任务进度，点开显示全文（限高、内部滚动）和任务清单。
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
  /** 跳回这条提问；不给时直接滚到这一轮顶部。 */
  onJump?: (turnId: string) => void;
}) {
  const [pinnedTurnId, setPinnedTurnId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => setOpen(false), [pinnedTurnId]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const turn = pinnedTurnId ? turns.find((item) => item.id === pinnedTurnId) : undefined;
  const user = turn?.user;
  if (!turn || !user) return null;

  const attachmentCount = user.attachments?.length ?? 0;
  const text = user.content || (attachmentCount > 0 ? `${attachmentCount} 个附件` : "");
  const todo = getLatestTodoMessage(turn.messages);
  const showTodo = Boolean(todo && (todo.totalCount > 0 || todo.status === "failed"));
  const jump = () => {
    setOpen(false);
    if (onJump) {
      onJump(turn.id);
      return;
    }
    scrollRef.current?.querySelector(`[data-conversation-turn-id="${CSS.escape(turn.id)}"]`)?.scrollIntoView({ block: "start" });
  };

  return (
    <div className={PINNED_LAYER_CLASS}>
      <div className={cx(PINNED_WRAP_CLASS, className)}>
        <div ref={cardRef} className={PINNED_CARD_CLASS} data-testid="pinned-turn-prompt">
          <button
            type="button"
            className={PINNED_ROW_CLASS}
            aria-expanded={open}
            aria-label={open ? "收起提问" : `展开提问：${oneLine(text)}`}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <span className={PINNED_LABEL_CLASS}>提问</span> : <span className={PINNED_TEXT_CLASS}>{oneLine(text)}</span>}
            {showTodo && todo ? (
              <span className={PINNED_PROGRESS_CLASS} aria-label={`任务 ${todo.completedCount}/${todo.totalCount}`}>
                <span
                  className="size-3 rounded-full"
                  style={{ background: `conic-gradient(var(--color-success) ${todo.totalCount ? (todo.completedCount / todo.totalCount) * 100 : 0}%, var(--color-border) 0)` }}
                  aria-hidden="true"
                />
                {todo.completedCount}/{todo.totalCount}
              </span>
            ) : null}
            <ChevronDown
              size={14}
              strokeWidth={2.2}
              aria-hidden="true"
              className={cx("shrink-0 text-text-faint transition-transform duration-(--motion-fast)", open && "rotate-180")}
            />
          </button>
          {open ? (
            <>
              <div className={PINNED_FULL_TEXT_CLASS}>{text}</div>
              {showTodo && todo ? <TodoListBlock message={todo} attached /> : null}
              <div className={PINNED_FOOTER_CLASS}>
                <Button variant="ghost" size="xs" onClick={jump}>跳到这条提问</Button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

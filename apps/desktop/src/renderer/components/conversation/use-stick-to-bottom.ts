import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const SCROLL_BOTTOM_THRESHOLD_PX = 80;

/**
 * 贴底跟随：内容增长（流式输出、消息变高）时停在底部；用户上滑阅读时暂停，滚回接近底部时恢复。
 * `contentKey` 变化（换了消息列表）时按当前状态跟随一次；同一条消息内部变高由 ResizeObserver 兜住。
 * 主会话的 ConversationView 还要处理轮次导航和向上补页，保留自己的实现；右栏这类简单列表用这个。
 */
export function useStickToBottom(contentKey: unknown) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const stuckRef = useRef(true);
  const [awayFromBottom, setAwayFromBottom] = useState(false);

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollable = el.scrollHeight > el.clientHeight + 1;
    const atBottom = !scrollable || el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_BOTTOM_THRESHOLD_PX;
    stuckRef.current = atBottom;
    setAwayFromBottom(scrollable && !atBottom);
  }, []);

  const followIfStuck = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !stuckRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    stuckRef.current = true;
    setAwayFromBottom(false);
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    followIfStuck();
    update();
  }, [contentKey, followIfStuck, update]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      followIfStuck();
      update();
    });
    if (scrollRef.current) observer.observe(scrollRef.current);
    if (contentRef.current) observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [followIfStuck, update]);

  return { scrollRef, contentRef, awayFromBottom, onScroll: update, scrollToBottom };
}

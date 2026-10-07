import { useCallback, useLayoutEffect, useRef } from "react";

const NEAR_BOTTOM_PX = 60;

/**
 * 自动贴底：用户在底部附近时，内容变化（`followKey` 变了）就滚到底；上翻查看历史时不抢位置。
 * `resetKey` 变了（换标签、换 Space）一律回到底部。
 */
export function useStickToBottom(followKey: string, resetKey: string) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const lastReset = useRef(resetKey);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (lastReset.current !== resetKey) {
      lastReset.current = resetKey;
      pinned.current = true;
    }
    if (pinned.current) el.scrollTop = el.scrollHeight;
  }, [followKey, resetKey]);

  return { ref, onScroll };
}

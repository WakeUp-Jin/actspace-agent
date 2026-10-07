import { useCallback, useRef, useState } from "react";
import { ConversationTurnRail, type ConversationTurnNavigationItem } from "../ConversationTurnRail";
import { pickActiveTurnId } from "./turns";

const TURN_RAIL_MIN_TURNS = 3;
const TURN_RAIL_MIN_VIEWPORT_WIDTH_PX = 640;

/**
 * 轮次导航的状态：每轮的 DOM 位置、当前高亮哪一轮、右侧导航条是否显示。
 * 贴底和滚动由 ConversationView 管，滚动后调 `sync` 更新这里。
 */
export function useTurnNavigator(items: readonly ConversationTurnNavigationItem[]) {
  const turnElementsRef = useRef(new Map<string, HTMLElement>());
  const [railVisible, setRailVisible] = useState(false);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(items[0]?.id ?? null);

  const sync = useCallback((viewport: HTMLElement, scrollable: boolean, atBottom: boolean) => {
    setRailVisible(
      scrollable &&
      viewport.clientWidth >= TURN_RAIL_MIN_VIEWPORT_WIDTH_PX &&
      items.length >= TURN_RAIL_MIN_TURNS,
    );

    if (items.length === 0) {
      setActiveTurnId(null);
      return;
    }

    if (atBottom) {
      setActiveTurnId(items[items.length - 1].id);
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const readingLine = viewportRect.top + Math.min(viewport.clientHeight * 0.32, 180);
    setActiveTurnId(pickActiveTurnId(items, (turnId) => turnElementsRef.current.get(turnId)?.getBoundingClientRect().top, readingLine));
  }, [items]);

  const setTurnElement = useCallback((turnId: string, element: HTMLElement | null) => {
    if (element) {
      turnElementsRef.current.set(turnId, element);
      return;
    }
    turnElementsRef.current.delete(turnId);
  }, []);

  /** 滚到某一轮的顶部。这一轮还没挂载时什么也不做，返回 false；`beforeScroll` 在滚动前调用。 */
  const scrollToTurn = useCallback((turnId: string, beforeScroll: () => void) => {
    const turnElement = turnElementsRef.current.get(turnId);
    if (!turnElement) return false;
    beforeScroll();
    setActiveTurnId(turnId);
    turnElement.scrollIntoView({ block: "start" });
    return true;
  }, []);

  return { railVisible, activeTurnId, sync, setTurnElement, scrollToTurn };
}

export function TurnNavigator({
  items,
  visible,
  activeTurnId,
  onNavigate,
}: {
  items: ConversationTurnNavigationItem[];
  visible: boolean;
  activeTurnId: string | null;
  onNavigate: (turnId: string) => void;
}) {
  if (!visible) return null;
  return <ConversationTurnRail items={items} activeTurnId={activeTurnId} onNavigate={onNavigate} />;
}

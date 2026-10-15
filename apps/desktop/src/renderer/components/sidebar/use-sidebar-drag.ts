import { useCallback, useMemo, useState } from "react";
import type { DragEvent } from "react";

/** 一行（会话或工作区）拖拽要挂的属性；`dropPosition` 决定插入线画在上沿还是下沿。 */
export type RowDrag = {
  draggable: true;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  dropPosition: "before" | "after" | null;
  isDragging: boolean;
};

export type SidebarReorder = (account: string, id: string, targetId: string, after: boolean) => void;

type DragState = { account: string; id: string };
type DropState = { id: string; after: boolean };

/**
 * 侧栏手动排序的拖拽（照 DSH）：只能落在同一个账本里——同一工作区的会话、置顶区、单列表、工作区行之间。
 * 用原生 HTML5 拖拽；不合法的位置不 preventDefault，浏览器自然显示不可放置。
 */
export function useSidebarDrag(onReorder: SidebarReorder) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [drop, setDrop] = useState<DropState | null>(null);

  const clear = useCallback(() => { setDrag(null); setDrop(null); }, []);

  const rowDrag = useCallback((account: string, id: string): RowDrag => ({
    draggable: true,
    onDragStart: (event) => {
      event.stopPropagation();
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", id);
      setDrag({ account, id });
    },
    onDragOver: (event) => {
      if (!drag || drag.account !== account) return;
      event.preventDefault();
      event.stopPropagation();
      if (drag.id === id) { if (drop) setDrop(null); return; }
      event.dataTransfer.dropEffect = "move";
      const rect = event.currentTarget.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      if (drop?.id !== id || drop.after !== after) setDrop({ id, after });
    },
    onDrop: (event) => {
      if (!drag || drag.account !== account) return;
      event.preventDefault();
      event.stopPropagation();
      if (drag.id !== id && drop?.id === id) onReorder(account, drag.id, id, drop.after);
      clear();
    },
    onDragEnd: clear,
    dropPosition: drag && drag.account === account && drop?.id === id ? (drop.after ? "after" : "before") : null,
    isDragging: drag?.account === account && drag.id === id,
  }), [clear, drag, drop, onReorder]);

  /** 挂在整个列表容器上：拖到行与行的空隙里不显示「禁止」光标。 */
  const containerProps = useMemo(() => ({
    onDragOver: (event: DragEvent<HTMLElement>) => { if (drag) event.preventDefault(); },
    onDrop: (event: DragEvent<HTMLElement>) => { if (drag) { event.preventDefault(); clear(); } },
  }), [clear, drag]);

  return { rowDrag, containerProps, dragging: drag !== null };
}

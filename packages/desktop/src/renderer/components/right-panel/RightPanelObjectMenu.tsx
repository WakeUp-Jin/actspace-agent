import { useEffect, useRef, useState } from "react";
import { Bot, Eye, FileCode2, FolderTree, Plus } from "lucide-react";
import { useRightPanel } from "./RightPanelContext";

/**
 * 右侧面板「+ 新建对象」菜单（参考 Cursor 顶栏的 +）。
 *
 * 放在右侧折叠按钮左侧，点开后可往右侧面板加对象：
 * - 工作区文件：唤出左侧文件树 rail（不新增 Tab）。
 * - Reply HTML：当前会话生成过的可视化 HTML 文件浏览器。
 * - Kairos：自治模式紧凑视图。
 * - Context：完整只读上下文视图。
 */

const MENU_CLASS =
  "absolute right-0 top-[calc(100%+4px)] z-[70] w-[188px] rounded-act-md border border-line bg-surface-raised/98 p-1.5 shadow-act-popover [-webkit-app-region:no-drag]";
const MENU_ITEM_CLASS =
  "flex min-h-[34px] w-full items-center gap-2.5 rounded-act-sm border-0 bg-transparent px-2.5 text-left text-[13px] font-medium text-text-main transition-colors hover:bg-brand-soft hover:text-brand [cursor:pointer]";

export function RightPanelObjectMenu({ sessionId }: { sessionId: string | null }) {
  const { openTab, openFileTree } = useRightPanel();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      if (!anchorRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const pick = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <div ref={anchorRef} className="relative flex items-center [-webkit-app-region:no-drag]">
      <button
        className="chrome-button"
        type="button"
        aria-label="New right panel object"
        aria-haspopup="menu"
        aria-expanded={open}
        title="新建对象"
        onClick={() => setOpen((value) => !value)}
      >
        <Plus size={15} strokeWidth={1.8} />
      </button>
      {open ? (
        <div className={MENU_CLASS} role="menu">
          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM_CLASS}
            onClick={() => pick(() => openFileTree())}
          >
            <FolderTree size={15} strokeWidth={2} />
            工作区文件
          </button>
          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM_CLASS}
            onClick={() => pick(() => openTab({ id: "reply-html", kind: "replyHtml", title: "Reply HTML", sessionId }))}
          >
            <FileCode2 size={15} strokeWidth={2} />
            Reply HTML
          </button>
          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM_CLASS}
            onClick={() => pick(() => openTab({ id: "kairos", kind: "kairos", title: "Kairos" }))}
          >
            <Bot size={15} strokeWidth={2} />
            Kairos
          </button>
          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM_CLASS}
            onClick={() => pick(() => openTab({ id: "context", kind: "context", title: "Context" }))}
          >
            <Eye size={15} strokeWidth={2} />
            Context
          </button>
        </div>
      ) : null}
    </div>
  );
}

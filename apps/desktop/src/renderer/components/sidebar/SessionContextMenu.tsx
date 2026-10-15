import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { AlignLeft, Archive, ArchiveRestore, Copy, GitFork, Hash, Pencil, Pin } from "lucide-react";
import {
  ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger,
} from "../ui/ContextMenu";
import { SESSION_CONTEXT_MENU_ICON_CLASS } from "./styles";

/** Shift+F10 / 菜单键：在 anchor 左下方派发 contextmenu，交给 ContextMenuTrigger 打开菜单。 */
export function openContextMenuFromKeyboard(event: ReactKeyboardEvent, trigger: HTMLElement | null, anchor: HTMLElement | null = trigger) {
  if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
  if (!trigger || !anchor) return;
  event.preventDefault();
  const rect = anchor.getBoundingClientRect();
  trigger.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: rect.left, clientY: rect.bottom + 4 }));
}

/** 行上的「⋯」按钮：在按钮左下方打开同一份右键菜单，不另做一份下拉菜单。 */
export function openContextMenuAt(trigger: HTMLElement | null, anchor: HTMLElement) {
  if (!trigger) return;
  const rect = anchor.getBoundingClientRect();
  trigger.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: rect.left, clientY: rect.bottom + 4 }));
}

type SessionContextMenuContentProps = {
  title: string;
  pinned: boolean;
  forkDisabled: boolean;
  forkLabel: string;
  archiveDisabled: boolean;
  archiveLabel: string;
  /** 已归档的会话：菜单里是「取消归档」，没有置顶。 */
  archived?: boolean;
  /** 菜单关闭时是否把焦点还给触发处；选了「重命名」时为 false，焦点留在输入框。 */
  shouldRestoreFocus: () => boolean;
  onStartRename: () => void;
  onTogglePin?: () => void;
  onRename?: (title: string) => void;
  onCopySessionId?: () => void;
  onCopyTranscript?: () => void;
  onFork?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
};

/** 会话行的右键菜单内容；外层的 ContextMenu 和触发区在 SessionRow 里。 */
export function SessionContextMenuContent({
  title,
  pinned,
  forkDisabled,
  forkLabel,
  archiveDisabled,
  archiveLabel,
  archived = false,
  shouldRestoreFocus,
  onStartRename,
  onTogglePin,
  onRename,
  onCopySessionId,
  onCopyTranscript,
  onFork,
  onArchive,
  onRestore,
}: SessionContextMenuContentProps) {
  return (
    <ContextMenuContent
      className="w-[184px]"
      aria-label={`会话操作： ${title}`}
      onCloseAutoFocus={(event) => {
        if (!shouldRestoreFocus()) event.preventDefault();
      }}
    >
      <ContextMenuItem disabled={!onTogglePin || archived} onSelect={() => onTogglePin?.()}>
        <Pin size={16} strokeWidth={1.9} fill={pinned ? "currentColor" : "none"} className={SESSION_CONTEXT_MENU_ICON_CLASS} aria-hidden="true" />
        {pinned ? "取消置顶" : "置顶"}
      </ContextMenuItem>
      <ContextMenuItem disabled={!onRename} onSelect={onStartRename}>
        <Pencil size={16} strokeWidth={1.9} className={SESSION_CONTEXT_MENU_ICON_CLASS} aria-hidden="true" />
        重命名
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger disabled={!onCopySessionId && !onCopyTranscript}>
          <Copy size={16} strokeWidth={1.9} className={SESSION_CONTEXT_MENU_ICON_CLASS} aria-hidden="true" />
          复制
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-52">
          <ContextMenuItem disabled={!onCopySessionId} onSelect={() => onCopySessionId?.()}>
            <Hash size={16} strokeWidth={1.9} className={SESSION_CONTEXT_MENU_ICON_CLASS} aria-hidden="true" />
            复制 ID
          </ContextMenuItem>
          <ContextMenuItem disabled={!onCopyTranscript} onSelect={() => onCopyTranscript?.()}>
            <AlignLeft size={16} strokeWidth={1.9} className={SESSION_CONTEXT_MENU_ICON_CLASS} aria-hidden="true" />
            复制会话记录
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem disabled={forkDisabled} title={forkLabel} onSelect={() => onFork?.()}>
        <GitFork size={16} strokeWidth={1.9} className={SESSION_CONTEXT_MENU_ICON_CLASS} aria-hidden="true" />
        分叉
      </ContextMenuItem>
      <ContextMenuSeparator />
      {archived ? (
        <ContextMenuItem disabled={!onRestore} onSelect={() => onRestore?.()}>
          <ArchiveRestore size={16} strokeWidth={1.9} className={SESSION_CONTEXT_MENU_ICON_CLASS} aria-hidden="true" />
          取消归档
        </ContextMenuItem>
      ) : (
        <ContextMenuItem disabled={archiveDisabled} title={archiveLabel} onSelect={() => onArchive?.()}>
          <Archive size={16} strokeWidth={1.9} className={SESSION_CONTEXT_MENU_ICON_CLASS} aria-hidden="true" />
          归档
        </ContextMenuItem>
      )}
    </ContextMenuContent>
  );
}

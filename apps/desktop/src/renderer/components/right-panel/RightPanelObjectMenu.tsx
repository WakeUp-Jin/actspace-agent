import { BookOpen, Eye, GitBranch, GitFork, Plus } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../ui/Menu";
import { useRightPanel } from "./RightPanelContext";
import { useOpenSideChat } from "./side-chat/use-open-side-chat";

/**
 * 右侧面板「+ 新建对象」菜单（参考 Cursor 顶栏的 +）。
 *
 * 放在右侧折叠按钮左侧，点开后可往右侧面板加对象：
 * - 文档：打开「文档」面板（工作区里的 Markdown，树 + 正文，可预览和编辑）。
 * - 改动：打开当前 workspace 的 Git Review。
 * - Context：完整只读上下文视图。
 * - 侧边对话：从当前会话分出一条新对话（本机运行目标才有）。
 */

export function RightPanelObjectMenu({
  sessionId,
  developmentEnabled = true,
  onOpenReview,
}: {
  sessionId: string | null;
  developmentEnabled?: boolean;
  onOpenReview?: () => void;
}) {
  const { openTab } = useRightPanel();
  const sideChat = useOpenSideChat(sessionId);

  return (
    <div className="flex items-center [-webkit-app-region:no-drag]">
      <Menu>
        <MenuTrigger asChild>
          <button className="chrome-button" type="button" aria-label="新建右侧面板对象" title="新建对象">
            <Plus size={15} strokeWidth={1.8} />
          </button>
        </MenuTrigger>
        <MenuContent align="end" className="w-[188px]">
          {sideChat.available ? (
            // 打开失败时 App 在主会话输入框上方提示原因。
            <MenuItem disabled={sideChat.opening} onSelect={() => void sideChat.open().catch(() => undefined)}>
              <GitFork size={15} strokeWidth={2} />
              侧边对话
            </MenuItem>
          ) : null}
          {developmentEnabled ? (
            <>
              <MenuItem onSelect={() => openTab({ id: "docs", kind: "docs", title: "文档" })}>
                <BookOpen size={15} strokeWidth={2} />
                文档
              </MenuItem>
              {onOpenReview ? (
                <MenuItem onSelect={onOpenReview}>
                  <GitBranch size={15} strokeWidth={2} />
                  改动
                </MenuItem>
              ) : null}
            </>
          ) : null}
          <MenuItem onSelect={() => openTab({ id: "context", kind: "context", title: "上下文" })}>
            <Eye size={15} strokeWidth={2} />
            上下文
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}

import { Eye, FolderTree, GitBranch, GitFork, MessageSquare, Plus, SquareTerminal } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../ui/Menu";
import { useRightPanel } from "./RightPanelContext";
import { useOpenTerminal } from "./useOpenTerminal";
import { preloadTerminalRenderView } from "./terminal-render-loader";
import { useOpenSideChat } from "./side-chat/use-open-side-chat";

/**
 * 右侧面板「+ 新建对象」菜单（参考 Cursor 顶栏的 +）。
 *
 * 放在右侧折叠按钮左侧，点开后可往右侧面板加对象：
 * - 工作区文件：切换工作区浏览态（操作栏 + 文件树两栏，不新增 Tab）。
 * - Review：打开当前 workspace 的 Git Review。
 * - Reply：当前会话生成过的可视化回复浏览器。
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
  const { openFileTree, openTab } = useRightPanel();
  const { openTerminal, creatingTerminal } = useOpenTerminal(sessionId);
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
              <MenuItem onSelect={openFileTree}>
                <FolderTree size={15} strokeWidth={2} />
                工作区文件
              </MenuItem>
              {onOpenReview ? (
                <MenuItem onSelect={onOpenReview}>
                  <GitBranch size={15} strokeWidth={2} />
                  Review
                </MenuItem>
              ) : null}
              <MenuItem
                disabled={!sessionId || creatingTerminal}
                // 鼠标移上或键盘移到这一项时预加载终端视图。
                onFocus={() => void preloadTerminalRenderView()}
                onSelect={() => void openTerminal()}
              >
                <SquareTerminal size={15} strokeWidth={2} />
                {creatingTerminal ? "正在启动…" : "终端"}
              </MenuItem>
            </>
          ) : null}
          <MenuItem onSelect={() => openTab({ id: "reply", kind: "replyHtml", title: "可视化回复", sessionId })}>
            <MessageSquare size={15} strokeWidth={2} />
            可视化回复
          </MenuItem>
          <MenuItem onSelect={() => openTab({ id: "context", kind: "context", title: "上下文" })}>
            <Eye size={15} strokeWidth={2} />
            上下文
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}

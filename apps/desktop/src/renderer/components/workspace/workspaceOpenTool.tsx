/**
 * 「在外部应用中打开」的共享部件：偏好持久化 + 应用图标回退。
 *
 * 两处消费：顶部 chrome 的工作区打开按钮，以及右侧面板文件视图的「打开」菜单。
 * 偏好共用同一个 localStorage key —— 用户在任一处选过 Cursor，另一处也该记住，
 * 各存一份会让同一个偏好出现两个互相矛盾的值。
 */

import { Code2, Folder, MonitorUp, Terminal } from "lucide-react";
import type { WorkspaceOpenTool, WorkspaceOpenToolId } from "@actspace/shared";

const LAST_TOOL_KEY = "actspace.workspace.open-tool.v1";

/**
 * 展示名的本地回退。
 *
 * 正常路径下 label 由 main 的工具目录给出；这张表只在目录还没拉到或拉取失败时兜底，
 * 否则菜单会直接把 `iterm2` 这种内部 id 显示给用户。
 */
export const OPEN_TOOL_LABELS: Record<WorkspaceOpenToolId, string> = {
  vscode: "VS Code",
  cursor: "Cursor",
  finder: "Finder",
  terminal: "Terminal",
  iterm2: "iTerm2",
};

const TOOL_IDS = new Set<string>(Object.keys(OPEN_TOOL_LABELS));

/** Finder 一定存在，所以它是最安全的兜底默认值。 */
export function readStoredOpenTool(): WorkspaceOpenToolId {
  const stored = typeof window === "undefined" ? null : window.localStorage.getItem(LAST_TOOL_KEY);
  return stored && TOOL_IDS.has(stored) ? (stored as WorkspaceOpenToolId) : "finder";
}

export function storeOpenTool(toolId: WorkspaceOpenToolId): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_TOOL_KEY, toolId);
}

/** 优先用 main 取到的真实 app 图标；拿不到（未安装 / 非 macOS）时退到语义线性图标。 */
export function toolIcon(tool: Pick<WorkspaceOpenTool, "id" | "label" | "iconDataUrl">, size = 14) {
  if (tool.iconDataUrl) {
    return (
      <img
        src={tool.iconDataUrl}
        alt=""
        className="shrink-0 rounded-[3px] object-contain"
        style={{ width: size, height: size }}
      />
    );
  }
  if (tool.id === "finder") return <Folder size={size} aria-hidden="true" />;
  if (tool.id === "terminal" || tool.id === "iterm2") return <Terminal size={size} aria-hidden="true" />;
  if (tool.id === "cursor") return <MonitorUp size={size} aria-hidden="true" />;
  return <Code2 size={size} aria-hidden="true" />;
}

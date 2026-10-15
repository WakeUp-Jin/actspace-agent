import { openRemoteFile } from "../../hooks/remoteArtifact";
import { dialogsApi } from "../../api/dialogs";
import { workspacesApi } from "../../api/workspaces";
import type { RightPanelTab } from "../right-panel/RightPanelContext";
import { READ_ERROR_TEXT, tabFromFile } from "../right-panel/workspaceFileTab";

/**
 * 在右侧面板打开本轮改动或交付的文件（工作区相对路径）。
 * 远端会话经 Host 读取；本地会话走 `workspaces.readFile`，复用文件树的同一套 Tab。
 * @returns 失败时给用户看的中文说明，成功返回 null。
 */
export async function openTurnFile({ sessionId, workspaceRoot, relativePath, openTab }: {
  sessionId: string | null | undefined;
  workspaceRoot: string | null | undefined;
  relativePath: string;
  openTab: (tab: RightPanelTab) => void;
}): Promise<string | null> {
  try {
    if (sessionId && await openRemoteFile(sessionId, relativePath, openTab)) return null;
    if (!workspaceRoot) return "该文件不在当前工作区内，暂时不能预览。";
    const result = await workspacesApi.readFile({ workspaceRoot, relativePath });
    if (result.error === "not_found" || result.error === "escapes_root") return READ_ERROR_TEXT[result.error];
    openTab(tabFromFile(result));
    return null;
  } catch {
    return "文件读取失败。";
  }
}

/**
 * 右键文件：本地会话弹 main 的文件菜单（在 Finder 中显示、拷贝路径等）；远端会话改为经 Host 下载。
 * @returns 失败时给用户看的中文说明，成功返回 null。
 */
export async function showTurnFileMenu({ sessionId, workspaceRoot, relativePath, remote, openTab }: {
  sessionId: string | null | undefined;
  workspaceRoot: string | null | undefined;
  relativePath: string;
  remote: boolean;
  openTab: (tab: RightPanelTab) => void;
}): Promise<string | null> {
  if (remote) {
    if (!sessionId) return null;
    try { await openRemoteFile(sessionId, relativePath, openTab, true); return null; }
    catch { return "远端文件下载失败，请确认连接后重试。"; }
  }
  if (!workspaceRoot) return null;
  try {
    const result = await dialogsApi.showArtifactContextMenu({ kind: "workspace_file", workspaceRoot, relativePath });
    return result.shown ? null : "无法打开文件菜单。";
  } catch {
    return "无法打开文件菜单。";
  }
}

import { useCallback } from "react";
import { workspacesApi } from "../../api/workspaces";
import { openRemoteFile } from "../../hooks/remoteArtifact";
import { useActiveSession } from "../../session/active-session-context";
import { useRunTargetContext } from "../../target/run-target-context";
import { useRightPanel } from "../right-panel/RightPanelContext";
import { readFailureTab, tabFromFile } from "../right-panel/workspaceFileTab";
import type { ReadMessageBlock } from "./render-message";

/** 工作区内的相对路径：非空、不是 `.`、不是绝对路径（含 Windows 盘符）、不含 `..`。 */
export function isSafeWorkspaceRelativePath(filePath: string): boolean {
  return filePath.length > 0
    && filePath !== "."
    && !filePath.startsWith("/")
    && !/^[A-Za-z]:[\\/]/.test(filePath)
    && !filePath.split(/[\\/]+/).includes("..");
}

/**
 * 会话里点文件（读文件工具行、回复里的文件链接）在右侧面板打开：
 * 远端会话从 Host 读，本机从当前工作区读；读不到时打开一个说明失败的 Tab。
 */
export function useWorkspaceFileLinks() {
  const { sessionId } = useActiveSession();
  const { target, selectedWorkspaceRoot } = useRunTargetContext();
  const isRemoteTarget = target.kind === "remote";
  const { openTab } = useRightPanel();
  const openReadFile = useCallback(async (message: ReadMessageBlock) => {
    const workspaceRoot = selectedWorkspaceRoot?.trim();
    const relativePath = message.filePath.trim();
    if (isRemoteTarget && sessionId) {
      try { await openRemoteFile(sessionId, relativePath, openTab); }
      catch { openTab({ id: `remote-error:${sessionId}:${relativePath}`, kind: "text", title: relativePath.split("/").at(-1) || "远端文件", content: "远端文件读取失败，请确认连接后重试。" }); }
      return;
    }
    if (!workspaceRoot || !isSafeWorkspaceRelativePath(relativePath)) return;
    try {
      openTab(tabFromFile(await workspacesApi.readFile({ workspaceRoot, relativePath })));
    } catch {
      const title = relativePath.split(/[\\/]/).pop() || relativePath;
      openTab(readFailureTab(relativePath, title));
    }
  }, [isRemoteTarget, sessionId, openTab, selectedWorkspaceRoot]);
  const openWorkspaceFile = useCallback((path: string) => {
    const normalizedPath = path.replace(/^file:\/\//i, "").replace(/\\/g, "/");
    const root = selectedWorkspaceRoot?.replace(/\\/g, "/").replace(/\/+$/, "");
    const relativePath = normalizedPath.startsWith(`${root ?? ""}/`)
      ? normalizedPath.slice((root ?? "").length + 1)
      : normalizedPath;
    if (!isSafeWorkspaceRelativePath(relativePath)) return;
    void openReadFile({ filePath: relativePath } as ReadMessageBlock);
  }, [openReadFile, selectedWorkspaceRoot]);
  return { openReadFile, openWorkspaceFile };
}

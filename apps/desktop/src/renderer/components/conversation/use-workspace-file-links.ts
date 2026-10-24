import { useCallback, useEffect, useRef } from "react";
import { localExecutionRoot } from "../../target/run-target";
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
  const workspaceRoot = localExecutionRoot(target, selectedWorkspaceRoot)?.trim();
  const isRemoteTarget = target.kind === "remote";
  const { openTab } = useRightPanel();
  const owner = useRef(0);
  useEffect(() => {
    owner.current += 1;
    return () => { owner.current += 1; };
  }, [sessionId, workspaceRoot, target.kind === "remote" ? target.hostId : target.kind]);
  const openReadFile = useCallback(async (message: ReadMessageBlock) => {
    const requestOwner = owner.current;
    const openIfCurrent = (tab: Parameters<typeof openTab>[0]) => {
      if (requestOwner === owner.current) openTab(tab);
    };
    const relativePath = message.filePath.trim();
    if (isRemoteTarget && sessionId) {
      try { await openRemoteFile(sessionId, relativePath, openIfCurrent); }
      catch { openIfCurrent({ id: `remote-error:${sessionId}:${relativePath}`, kind: "text", title: relativePath.split("/").at(-1) || "远端文件", content: "远端文件读取失败，请确认连接后重试。" }); }
      return;
    }
    if (!workspaceRoot || !isSafeWorkspaceRelativePath(relativePath)) return;
    try {
      openIfCurrent(tabFromFile(await workspacesApi.readFile({ workspaceRoot, relativePath }), { workspaceRoot }));
    } catch {
      const title = relativePath.split(/[\\/]/).pop() || relativePath;
      openIfCurrent(readFailureTab(relativePath, title, { workspaceRoot }));
    }
  }, [isRemoteTarget, sessionId, openTab, workspaceRoot]);
  const openWorkspaceFile = useCallback((path: string) => {
    const normalizedPath = path.replace(/^file:\/\//i, "").replace(/\\/g, "/");
    const root = workspaceRoot?.replace(/\\/g, "/").replace(/\/+$/, "");
    const relativePath = normalizedPath.startsWith(`${root ?? ""}/`)
      ? normalizedPath.slice((root ?? "").length + 1)
      : normalizedPath;
    if (!isSafeWorkspaceRelativePath(relativePath)) return;
    void openReadFile({ filePath: relativePath } as ReadMessageBlock);
  }, [openReadFile, workspaceRoot]);
  return { openReadFile, openWorkspaceFile };
}

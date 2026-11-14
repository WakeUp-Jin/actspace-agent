import { useCallback, useEffect, useRef } from "react";
import { localExecutionRoot } from "../../target/run-target";
import { openRemoteFile } from "../../hooks/remoteArtifact";
import { useActiveSession } from "../../session/active-session-context";
import { useRunTargetContext } from "../../target/run-target-context";
import { useRightPanel } from "../right-panel/RightPanelContext";
import { useOpenWorkspacePath } from "../files/open-file-fallback-context";
import { readFailureTab } from "../right-panel/workspaceFileTab";
import type { ReadMessageBlock } from "./render-message";

/** 工作区内的相对路径：非空、不是 `.`、不是绝对路径（含 Windows 盘符）、不含 `..`。 */
export function isSafeWorkspaceRelativePath(filePath: string): boolean {
  return (
    filePath.length > 0 &&
    filePath !== "." &&
    !filePath.startsWith("/") &&
    !/^[A-Za-z]:[\\/]/.test(filePath) &&
    !filePath.split(/[\\/]+/).includes("..")
  );
}

/**
 * 会话里点文件（读文件工具行、回复里的文件链接）在右侧面板打开：
 * 远端会话从 Host 读，本机从当前工作区读；读不到时打开一个说明失败的 Tab。
 * 本机文件走统一打开路由：Markdown / 图片在面板里打开，其余交给系统默认应用。
 */
export function useWorkspaceFileLinks() {
  const { sessionId } = useActiveSession();
  const { target, selectedWorkspaceRoot } = useRunTargetContext();
  const workspaceRoot = localExecutionRoot(target, selectedWorkspaceRoot)?.trim();
  const isRemoteTarget = target.kind === "remote";
  const { openTab } = useRightPanel();
  const openPath = useOpenWorkspacePath();
  const owner = useRef(0);
  useEffect(() => {
    owner.current += 1;
    return () => {
      owner.current += 1;
    };
  }, [sessionId, workspaceRoot, target.kind === "remote" ? target.hostId : target.kind]);
  /** `line`（1 起始）只在本机打开 Markdown 时生效：「文档」面板滚到该行；其他文件、远端会话忽略。 */
  const openReadFile = useCallback(
    async (message: ReadMessageBlock, line?: number) => {
      const requestOwner = owner.current;
      const openIfCurrent = (tab: Parameters<typeof openTab>[0]) => {
        if (requestOwner === owner.current) openTab(tab);
      };
      const relativePath = message.filePath.trim();
      if (isRemoteTarget && sessionId) {
        try {
          await openRemoteFile(sessionId, relativePath, openIfCurrent);
        } catch {
          openIfCurrent({
            id: `remote-error:${sessionId}:${relativePath}`,
            kind: "text",
            title: relativePath.split("/").at(-1) || "远端文件",
            content: "远端文件读取失败，请确认连接后重试。",
          });
        }
        return;
      }
      if (!workspaceRoot || !isSafeWorkspaceRelativePath(relativePath)) return;
      const result = await openPath({
        workspaceRoot,
        relativePath,
        openTab: openIfCurrent,
        ...(line !== undefined ? { line } : {}),
      });
      if (result.ok === false && result.reason === "error") {
        openIfCurrent(
          readFailureTab(
            relativePath,
            relativePath.split(/[\\/]/).pop() || relativePath,
            { workspaceRoot },
            result.message,
          ),
        );
      }
    },
    [isRemoteTarget, sessionId, openTab, openPath, workspaceRoot],
  );
  const openWorkspaceFile = useCallback(
    (path: string, line?: number) => {
      const normalizedPath = path.replace(/^file:\/\//i, "").replace(/\\/g, "/");
      const root = workspaceRoot?.replace(/\\/g, "/").replace(/\/+$/, "");
      const relativePath = normalizedPath.startsWith(`${root ?? ""}/`)
        ? normalizedPath.slice((root ?? "").length + 1)
        : normalizedPath;
      if (!isSafeWorkspaceRelativePath(relativePath)) return;
      void openReadFile({ filePath: relativePath } as ReadMessageBlock, line);
    },
    [openReadFile, workspaceRoot],
  );
  return { openReadFile, openWorkspaceFile, workspaceRoot: isRemoteTarget ? undefined : workspaceRoot || undefined };
}

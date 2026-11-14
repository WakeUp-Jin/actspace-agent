import type { WorkspaceReadFileResult } from "@actspace/shared";
import { workspaceFileTabId, type RightPanelTab, type WorkspaceFileTarget } from "./RightPanelContext";

/**
 * 读盘结果 → 右侧面板 Tab。
 *
 * 抽成独立模块的原因：文件树首次打开、操作栏刷新、过期后重新加载三条路径都要做同一件事，
 * 各写一份必然漂移（早期只有文件树一处，刷新能力加上来就必须收口）。
 */

export const READ_ERROR_TEXT: Record<NonNullable<WorkspaceReadFileResult["error"]>, string> = {
  too_large: "文件过大，暂不在此预览。",
  not_found: "文件不存在或已被移动。",
  not_a_file: "这是一个目录，不是文件。",
  escapes_root: "路径超出工作区范围，已拒绝读取。",
};

/** 文件标签只预览图片；Markdown 在「文档」面板里读，其他文件交给系统。 */
const EXTERNAL_FILE_TEXT = "这类文件不在应用内预览，请用系统默认应用打开。";

export function tabFromFile(result: WorkspaceReadFileResult, target?: WorkspaceFileTarget): RightPanelTab {
  const id = workspaceFileTabId(result.relativePath, target);
  const title = result.relativePath.split("/").pop() || result.relativePath;
  const meta = {
    // 调用方可直接传入旧 Tab；目标只提供身份，不能把旧正文或渲染类型带回新结果。
    workspaceRoot: target?.workspaceRoot,
    hostId: target?.hostId,
    relativePath: result.relativePath,
    mtimeMs: result.mtimeMs,
    size: result.size,
    isStale: false,
  };

  if (result.error) {
    return { id, kind: "text", title, content: READ_ERROR_TEXT[result.error], ...meta };
  }
  switch (result.renderKind) {
    case "image":
      return { id, kind: "image", title, src: result.dataUrl ?? "", ...meta };
    default:
      // Markdown 走文档面板、external 交给系统打开，正常不会走到这里（例如重载一个旧标签时才会）。
      return { id, kind: "text", title, content: EXTERNAL_FILE_TEXT, ...meta };
  }
}

export function readFailureTab(
  relativePath: string,
  title: string,
  target?: WorkspaceFileTarget,
  content = "读取文件失败。",
): RightPanelTab {
  return {
    id: workspaceFileTabId(relativePath, target),
    workspaceRoot: target?.workspaceRoot,
    hostId: target?.hostId,
    kind: "text",
    title,
    content,
    relativePath,
  };
}

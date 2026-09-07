import type { WorkspaceReadFileResult } from "@actspace/shared";
import { workspaceFileTabId, type RightPanelTab } from "./RightPanelContext";

/**
 * 读盘结果 → 右侧面板 Tab。
 *
 * 抽成独立模块的原因：文件树首次打开、操作栏刷新、过期后重新加载三条路径都要做同一件事，
 * 各写一份必然漂移（早期只有文件树一处，刷新能力加上来就必须收口）。
 */

export const READ_ERROR_TEXT: Record<NonNullable<WorkspaceReadFileResult["error"]>, string> = {
  too_large: "文件过大，暂不在此预览。",
  binary: "二进制文件，暂不预览。",
  not_found: "文件不存在或已被移动。",
  not_a_file: "这是一个目录，不是文件。",
  escapes_root: "路径超出工作区范围，已拒绝读取。",
};

export function tabFromFile(result: WorkspaceReadFileResult): RightPanelTab {
  const id = workspaceFileTabId(result.relativePath);
  const title = result.relativePath.split("/").pop() || result.relativePath;
  const meta = {
    relativePath: result.relativePath,
    mtimeMs: result.mtimeMs,
    size: result.size,
    isStale: false,
  };

  if (result.error) {
    return { id, kind: "text", title, content: READ_ERROR_TEXT[result.error], ...meta };
  }
  const truncated = result.truncated ? { truncated: true } : {};
  switch (result.renderKind) {
    case "markdown":
      return { id, kind: "markdown", title, source: result.content ?? "", ...meta, ...truncated };
    case "html":
      return { id, kind: "html", title, html: result.content ?? "", trust: "file", ...meta, ...truncated };
    case "image":
      return { id, kind: "image", title, src: result.dataUrl ?? "", ...meta };
    case "csv":
      return { id, kind: "csv", title, content: result.content ?? "", ...meta, ...truncated };
    default:
      return {
        id,
        kind: "text",
        title,
        content: result.content ?? "",
        language: result.language,
        ...meta,
        ...truncated,
      };
  }
}

export function readFailureTab(relativePath: string, title: string): RightPanelTab {
  return {
    id: workspaceFileTabId(relativePath),
    kind: "text",
    title,
    content: "读取文件失败。",
    relativePath,
  };
}

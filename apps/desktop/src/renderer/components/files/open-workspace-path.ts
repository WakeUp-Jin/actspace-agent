import type { WorkspaceOpenFileResult } from "@actspace/shared";
import { workspacesApi } from "../../api/workspaces";
import { READ_ERROR_TEXT, tabFromFile } from "../right-panel/workspaceFileTab";
import type { RightPanelTab } from "../right-panel/RightPanelContext";

/**
 * 「点一个工作区文件」的统一路由（本机会话；远端 Host 会话走 `hooks/remoteArtifact.ts`，不经过这里）。
 * Markdown 打开右侧「MD 文档」面板并在树里选中、展开到该文件；图片开预览标签；
 * 其余全部交给系统：`.html` / `.htm` 进默认浏览器，其他进默认应用。
 * 设计见 `docs/design-docs/架构优化/01-功能减法设计.md` 第 2 节和 `front-文档面板规范.md`。
 */

export type WorkspaceFileOpenKind = "markdown" | "image" | "external";

const MARKDOWN_EXT = /\.(?:md|markdown)$/i;
const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|svg)$/i;

export function classifyWorkspaceFile(relativePath: string): WorkspaceFileOpenKind {
  if (MARKDOWN_EXT.test(relativePath)) return "markdown";
  if (IMAGE_EXT.test(relativePath)) return "image";
  return "external";
}

export type OpenWorkspacePathResult =
  | { ok: true }
  /** 系统里没有任何应用能打开这个文件：调用方弹兜底对话框，不再另外提示。 */
  | { ok: false; reason: "no_app"; relativePath: string }
  | { ok: false; reason: "error"; message: string };

const OPEN_ERROR_TEXT = "无法打开这个文件。";

function externalFailure(result: WorkspaceOpenFileResult, relativePath: string): OpenWorkspacePathResult {
  if (result.ok) return { ok: true };
  if (result.error === "no_application") return { ok: false, reason: "no_app", relativePath };
  return { ok: false, reason: "error", message: OPEN_ERROR_TEXT };
}

export type OpenWorkspacePathInput = {
  workspaceRoot: string;
  relativePath: string;
  /** 1 起始的行号（如 `a.md:12`）。只有打开 Markdown 时才传给文档面板，其他文件交给外部应用，忽略。 */
  line?: number;
  openTab: (tab: RightPanelTab) => void;
};

/** `openWorkspacePath` 的函数形状；组件里经 `useOpenWorkspacePath()` 拿到的是会弹兜底对话框的版本。 */
export type OpenWorkspacePath = (input: OpenWorkspacePathInput) => Promise<OpenWorkspacePathResult>;

export async function openWorkspacePath({
  workspaceRoot,
  relativePath,
  line,
  openTab,
}: OpenWorkspacePathInput): Promise<OpenWorkspacePathResult> {
  try {
    if (classifyWorkspaceFile(relativePath) === "external") {
      return externalFailure(
        await workspacesApi.openFile({ workspaceRoot, relativePath, action: "open" }),
        relativePath,
      );
    }
    if (classifyWorkspaceFile(relativePath) === "markdown") {
      // 只确认文件还在：正文由文档面板自己读（读取、草稿、新鲜度都归它管）。
      const stat = await workspacesApi.statFile({ workspaceRoot, relativePath });
      if (stat.error === "not_found" || stat.error === "escapes_root" || stat.error === "not_a_file") {
        return { ok: false, reason: "error", message: READ_ERROR_TEXT[stat.error] };
      }
      openTab({
        id: "docs",
        kind: "docs",
        title: "MD 文档",
        select: stat.relativePath || relativePath,
        ...(line !== undefined ? { line } : {}),
      });
      return { ok: true };
    }
    const result = await workspacesApi.readFile({ workspaceRoot, relativePath });
    if (result.error === "not_found" || result.error === "escapes_root") {
      return { ok: false, reason: "error", message: READ_ERROR_TEXT[result.error] };
    }
    openTab(tabFromFile(result, { workspaceRoot }));
    return { ok: true };
  } catch {
    return { ok: false, reason: "error", message: "文件读取失败。" };
  }
}

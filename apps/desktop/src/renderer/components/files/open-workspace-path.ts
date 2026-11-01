import type { WorkspaceOpenFileResult } from "@actspace/shared";
import { workspacesApi } from "../../api/workspaces";
import { READ_ERROR_TEXT, tabFromFile } from "../right-panel/workspaceFileTab";
import type { RightPanelTab } from "../right-panel/RightPanelContext";

/**
 * 「点一个工作区文件」的统一路由（本机会话；远端 Host 会话走 `hooks/remoteArtifact.ts`，不经过这里）。
 * 应用内只渲染 Markdown 和图片，其余全部交给系统：`.html` / `.htm` 进默认浏览器，其他进默认应用。
 * 设计见 `docs/design-docs/架构优化/01-功能减法设计.md` 第 2 节。
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
  openTab: (tab: RightPanelTab) => void;
};

/** `openWorkspacePath` 的函数形状；组件里经 `useOpenWorkspacePath()` 拿到的是会弹兜底对话框的版本。 */
export type OpenWorkspacePath = (input: OpenWorkspacePathInput) => Promise<OpenWorkspacePathResult>;

export async function openWorkspacePath({ workspaceRoot, relativePath, openTab }: OpenWorkspacePathInput): Promise<OpenWorkspacePathResult> {
  try {
    if (classifyWorkspaceFile(relativePath) === "external") {
      return externalFailure(await workspacesApi.openFile({ workspaceRoot, relativePath, action: "open" }), relativePath);
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

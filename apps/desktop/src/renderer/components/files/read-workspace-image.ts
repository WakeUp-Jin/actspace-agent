import { workspacesApi } from "../../api/workspaces";

/**
 * 本机工作区里的图片读成 data URL（Markdown 里的本地图片用）；不是图片、读不到都返回 null，调用方显示占位。
 * 「文档」编辑器和聊天区共用。
 */
export async function readWorkspaceImage(workspaceRoot: string, relativePath: string): Promise<string | null> {
  try {
    const result = await workspacesApi.readFile({ workspaceRoot, relativePath });
    return !result.error && result.renderKind === "image" && result.dataUrl ? result.dataUrl : null;
  } catch {
    return null;
  }
}

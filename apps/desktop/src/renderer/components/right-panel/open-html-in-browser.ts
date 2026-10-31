import { workspacesApi } from "../../api/workspaces";

/** 工作区里的 HTML 文件不在右侧面板渲染：脚本、相对资源和全宽布局在面板里都跑不全，交给系统默认浏览器打开。 */
export function isHtmlFilePath(relativePath: string): boolean {
  return /\.html?$/i.test(relativePath);
}

/** @returns 失败时给用户看的中文说明，成功返回 null。 */
export async function openHtmlInBrowser(workspaceRoot: string, relativePath: string): Promise<string | null> {
  try {
    const result = await workspacesApi.openFile({ workspaceRoot, relativePath, action: "open" });
    return result.ok ? null : "无法在浏览器中打开这个 HTML 文件。";
  } catch {
    return "无法在浏览器中打开这个 HTML 文件。";
  }
}

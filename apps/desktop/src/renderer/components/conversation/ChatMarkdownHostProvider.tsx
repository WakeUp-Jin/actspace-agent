import { useMemo, type ReactNode } from "react";
import { readWorkspaceImage } from "../files/read-workspace-image";
import { MarkdownHostContext, type MarkdownHost } from "../messages/markdown/host";
import { useWorkspaceFileLinks } from "./use-workspace-file-links";

/**
 * 聊天区 Markdown 的宿主能力（聊天区规范 §4 宿主接口，T23），挂在工作台上：
 * 对话区、右栏子 Agent 面板、子 Agent 记录里的回复都从这里拿，不用逐层传 props。
 * - `openPath(path, line?)`：`useWorkspaceFileLinks().openWorkspaceFile`；本机打开 Markdown 时带行号跳到「文档」面板对应行；
 * - `loadImage`：本机会话读工作区文件的 dataUrl；远端会话不提供（图片显示占位，单击打开）；
 * - `workspaceRoot`：本机工作区根，用来认出回复里写的工作区内绝对路径。
 */
export function ChatMarkdownHostProvider({ children }: { children: ReactNode }) {
  const { openWorkspaceFile, workspaceRoot } = useWorkspaceFileLinks();
  // loadImage 只依赖工作区根：openWorkspaceFile 随右栏状态变化时 host 会换，loader 引用必须不变，图片缓存才会命中。
  const loadImage = useMemo(() => workspaceRoot ? (path: string) => readWorkspaceImage(workspaceRoot, path) : undefined, [workspaceRoot]);
  const host = useMemo<MarkdownHost>(() => ({
    openPath: openWorkspaceFile,
    workspaceRoot,
    ...(loadImage ? { loadImage } : {}),
  }), [openWorkspaceFile, workspaceRoot, loadImage]);
  return <MarkdownHostContext.Provider value={host}>{children}</MarkdownHostContext.Provider>;
}

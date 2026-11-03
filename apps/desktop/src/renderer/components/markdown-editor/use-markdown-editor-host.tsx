import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loadAppearance } from "../../appearance/storage";
import { useOpenWorkspacePath } from "../files/open-file-fallback-context";
import { readWorkspaceImage } from "../files/read-workspace-image";
import { MermaidPreviewDialog } from "../messages/MermaidPreviewDialog";
import { downloadMermaidPng, mermaidTheme, renderMermaid, type MermaidRenderResult } from "../messages/mermaid-renderer";
import { useRightPanel } from "../right-panel/RightPanelContext";
import { readFailureTab } from "../right-panel/workspaceFileTab";
import type { MarkdownEditorHost } from "./host";

/**
 * `MarkdownEditorHost` 的 React 实现（规范 §3.2）：core 需要的外部能力都在这里接到现有模块上。
 *
 * - `openPath`：`useOpenWorkspacePath()`（Markdown 开文档面板并带行号，图片开图片标签，其他交给系统）；
 * - `openUrl`：`window.open`，主进程的 `setWindowOpenHandler` 会转给 `openExternalSafely`；
 * - `loadImage`：`workspacesApi.readFile` 取 `dataUrl`；没有本地工作区（远端会话）返回 null；
 * - `renderMermaid` / `previewMermaid`：复用聊天区的渲染器和大图对话框，主题取外观设置里的 `mermaidTheme`。
 *
 * 宿主对象只随 `docPath` / `workspaceRoot` 变化而换：换了就会让 core 重算装饰，不能每次渲染都新建。
 * 其余依赖（openTab、兜底对话框）经 ref 读最新值。
 */
export function useMarkdownEditorHost({ docPath, workspaceRoot }: { docPath: string; workspaceRoot?: string }): {
  host: MarkdownEditorHost;
  /** 「查看大图」对话框；需要渲染在组件树里。 */
  previewDialog: ReactNode;
} {
  const { openTab } = useRightPanel();
  const openWorkspacePath = useOpenWorkspacePath();
  const [preview, setPreview] = useState<MermaidRenderResult | null>(null);

  const latest = useRef({ openTab, openWorkspacePath });
  latest.current = { openTab, openWorkspacePath };
  // 卸载后异步结果回来不再写状态（宿主可能被 widget 在卸载后的最后一次回调里用到）。
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const host = useMemo<MarkdownEditorHost>(() => ({
    docPath,
    workspaceRoot,
    openPath(relativePath, line) {
      if (!workspaceRoot) return;
      const { openTab: open, openWorkspacePath: openPath } = latest.current;
      void openPath({ workspaceRoot, relativePath, line, openTab: open }).then((result) => {
        // `no_app` 已由兜底对话框处理；读不到文件时开一个说明失败的标签，与聊天区一致。
        if (result.ok === false && result.reason === "error") {
          open(readFailureTab(relativePath, relativePath.split("/").pop() || relativePath, { workspaceRoot }, result.message));
        }
      });
    },
    openUrl(url) {
      window.open(url, "_blank", "noopener");
    },
    loadImage(relativePath) {
      return workspaceRoot ? readWorkspaceImage(workspaceRoot, relativePath) : Promise.resolve(null);
    },
    // 每次渲染时读外观设置，主题改了下一次渲染就生效。
    renderMermaid: (source) => renderMermaid(source, loadAppearance().mermaidTheme),
    previewMermaid(result) {
      if (alive.current) setPreview(result);
    },
  }), [docPath, workspaceRoot]);

  const theme = mermaidTheme(loadAppearance().mermaidTheme);
  const previewDialog = preview ? (
    <MermaidPreviewDialog
      result={preview}
      theme={theme}
      onClose={() => setPreview(null)}
      onDownload={() => void downloadMermaidPng(preview, theme).catch(() => undefined)}
    />
  ) : null;

  return { host, previewDialog };
}

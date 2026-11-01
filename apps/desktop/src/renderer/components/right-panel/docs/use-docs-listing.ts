import { useEffect, useRef, useState } from "react";
import { workspacesApi } from "../../../api/workspaces";
import { useRightPanel } from "../RightPanelContext";

/**
 * 取回工作区的 Markdown 清单（整棵一次取回，在 renderer 组装成树）。
 *
 * 不挂文件监听，只在三个时机重新获取：打开「文档」面板（挂载）时、每轮 Agent 结束时（`revalidateKey`）、
 * 用户点树顶的刷新按钮时（`docsRefreshKey`）。结果放在 context 里，面板收起再展开能立刻看到上次的清单。
 */
export type DocsListingStatus = "idle" | "loading" | "ready" | "error";

export function useDocsListing({ workspaceRoot, revalidateKey }: { workspaceRoot?: string; revalidateKey?: number }) {
  const { docsListing, setDocsListing, docsRefreshKey } = useRightPanel();
  const [status, setStatus] = useState<DocsListingStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    if (!workspaceRoot) {
      setStatus("idle");
      return;
    }
    const mine = ++sequence.current;
    setStatus("loading");
    setError(null);
    workspacesApi
      .listMarkdownFiles({ workspaceRoot })
      .then((result) => {
        if (mine !== sequence.current) return;
        if (result.ok === false) {
          setStatus("error");
          setError(result.error === "not_found" ? "工作区目录不存在。" : "无法读取工作区目录。");
          return;
        }
        setDocsListing({ root: workspaceRoot, files: result.files, truncated: result.truncated, source: result.source });
        setStatus("ready");
      })
      .catch(() => {
        if (mine !== sequence.current) return;
        setStatus("error");
        setError("无法读取工作区目录。");
      });
    return () => {
      sequence.current += 1;
    };
  }, [workspaceRoot, docsRefreshKey, revalidateKey, setDocsListing]);

  // 清单属于哪个根要核对：换根后旧清单不能显示。
  const listing = docsListing && docsListing.root === workspaceRoot ? docsListing : null;
  return { listing, status, error };
}

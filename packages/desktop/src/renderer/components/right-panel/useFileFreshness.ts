import { useCallback, useEffect, useRef } from "react";
import { isWorkspaceFileTab, useRightPanel, type WorkspaceFileMeta } from "./RightPanelContext";
import { readFailureTab, tabFromFile } from "./workspaceFileTab";

/**
 * 已打开文件 Tab 的新鲜度检测。
 *
 * 文件内容是打开那一刻的快照，磁盘随后可能被 Agent、外部编辑器或 git checkout 改掉。
 * 早期实现没有任何刷新机制，右侧会一直显示旧内容且不给提示 —— 在 Agent 编码场景里会直接让人误判。
 *
 * 这里用两级信号，不用 fs-watch 插件（理由见
 * `docs/exec-plans/active/20260730-right-panel-file-view-optimization.md` 的决策记录：
 * 那是用户可选安装的常驻进程，监听根与当前 workspaceRoot 无关，且输出是给 Agent 读的审计日志）：
 *
 * 1. **Agent 编辑事件**（主力，零成本）：`edit_diff` / `write_diff` 消息块自带 `filePath`，
 *    renderer 本来就实时收到，直接 `markFileTabStale`。由 `App.tsx` 调用，不在本 hook 内。
 * 2. **mtime 重校验**（兜底，O(1)）：本 hook 负责。只在三个时机各 stat 一次
 *    —— Tab 激活、窗口重获焦点、turn 结束 —— **不做轮询**。
 *
 * 检测到变化只打 stale 标记，内容替换必须由用户点「重新加载」触发：
 * 用户可能正在阅读或选中文本，内容被自动抽换比看到旧内容更糟。
 */
export function useFileFreshness({
  workspaceRoot,
  revalidateKey,
}: {
  workspaceRoot?: string;
  /** 外部驱动的重校验触发器（当前会话 turn 结束时递增）。 */
  revalidateKey?: number;
}) {
  const { tabs, activeTabId, markFileTabStale } = useRightPanel();

  // 用 ref 读最新 tabs，让 effect 依赖保持在「触发时机」上，
  // 否则 tabs 每次变化都会重新跑一遍 stat，等价于变相轮询。
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const revalidate = useCallback(async () => {
    const api = typeof window !== "undefined" ? window.actspace?.statWorkspaceFile : undefined;
    if (!api) return;

    const targets = tabsRef.current.filter((tab) => {
      if (!isWorkspaceFileTab(tab)) return false;
      const meta = tab as WorkspaceFileMeta;
      // 已经标记过期的不用再查；没有基线 mtime 的（旧 Tab / 读失败）也无从比对。
      return !meta.isStale && typeof meta.mtimeMs === "number" && meta.mtimeMs > 0;
    });
    if (targets.length === 0) return;

    await Promise.all(
      targets.map(async (tab) => {
        const meta = tab as WorkspaceFileMeta;
        const relativePath = meta.relativePath as string;
        try {
          const result = await api({ workspaceRoot, relativePath });
          if (result.error) return;
          if (result.mtimeMs !== meta.mtimeMs || result.size !== meta.size) {
            markFileTabStale(relativePath);
          }
        } catch {
          // 读不到就当没变化：这里只负责提示新鲜度，不该把偶发 IPC 失败升级成错误 UI。
        }
      }),
    );
  }, [workspaceRoot, markFileTabStale]);

  // 时机一：Tab 激活（切到某个文件 Tab 时确认手里这份还是最新的）。
  useEffect(() => {
    if (!activeTabId) return;
    void revalidate();
  }, [activeTabId, revalidate]);

  // 时机二：turn 结束（Agent 可能刚改过文件；补上信号 1 漏掉的间接改动，例如 bash 脚本写文件）。
  useEffect(() => {
    if (revalidateKey === undefined) return;
    void revalidate();
  }, [revalidateKey, revalidate]);

  // 时机三：窗口重新获得焦点 / 页面重新可见（覆盖外部编辑器与 git checkout）。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onFocus = () => void revalidate();
    const onVisible = () => {
      if (document.visibilityState === "visible") void revalidate();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [revalidate]);
}

/**
 * 信号 1：把 Agent 本轮改过的文件对应的 Tab 标记为过期。
 *
 * 这是最精确也最便宜的信号 —— `edit_diff` / `write_diff` 消息块自带被改文件的路径，
 * renderer 本来就实时收到，不需要任何文件监听设施。
 *
 * `editedPaths` 可能是绝对路径也可能是工作区相对路径（取决于工具 preview 怎么给），
 * 所以按「相等或以 `/<relativePath>` 结尾」匹配，两种形式都能命中。
 */
export function useAgentEditSignals(editedPaths: readonly string[]) {
  const { tabs, markFileTabStale } = useRightPanel();

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  // 只在「改过的文件集合」真的变化时才跑，避免每次消息流更新都全量比对。
  const signature = editedPaths.join("\u0000");

  useEffect(() => {
    if (editedPathsOf(signature).length === 0) return;
    const edited = editedPathsOf(signature);
    for (const tab of tabsRef.current) {
      if (!isWorkspaceFileTab(tab)) continue;
      const meta = tab as WorkspaceFileMeta;
      const relativePath = meta.relativePath as string;
      if (meta.isStale) continue;
      const hit = edited.some(
        (path) => path === relativePath || path.endsWith(`/${relativePath}`),
      );
      if (hit) markFileTabStale(relativePath);
    }
  }, [signature, markFileTabStale]);
}

function editedPathsOf(signature: string): string[] {
  return signature.length === 0 ? [] : signature.split("\u0000");
}

/** 重新读盘并替换 Tab 内容（操作栏「刷新」与过期提示条的「重新加载」共用）。 */
export function useReloadFileTab(workspaceRoot?: string) {
  const { replaceTab } = useRightPanel();

  return useCallback(
    async (relativePath: string, title: string) => {
      const api = typeof window !== "undefined" ? window.actspace?.readWorkspaceFile : undefined;
      if (!api) return;
      try {
        replaceTab(tabFromFile(await api({ workspaceRoot, relativePath })));
      } catch {
        replaceTab(readFailureTab(relativePath, title));
      }
    },
    [workspaceRoot, replaceTab],
  );
}

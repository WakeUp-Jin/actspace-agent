import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceReadFileResult } from "@actspace/shared";
import { workspacesApi } from "../../../api/workspaces";
import { isDocsDocDirty, useRightPanel, type DocsDocState } from "../RightPanelContext";
import { takeDocsDraft } from "./docs-draft-store";

/**
 * 「文档」面板里当前那一篇的读盘、草稿、保存和新鲜度（规范见 `front-文档面板规范.md`）。
 *
 * 状态本身放在 `RightPanelContext`（面板会反复卸载，草稿不能丢）；这里只负责让它和磁盘对齐：
 * - 选中路径变化时读盘（只读当前这一篇，切换时上一篇随 `docsDoc` 一起被替换）；
 * - 保存：`writeMarkdownFile` 成功后把「原文」和 mtime / size 基线一起更新，已变化提示条随之消失；
 * - 新鲜度：和原文件 Tab 同一套规则，只在三个时机各 stat 一次（挂载 / 窗口重获焦点 / turn 结束）加 Agent 编辑信号，
 *   不轮询；检测到变化只打 `isStale`，由用户点「重新加载」，不会替换正在编辑的内容。
 */

const READ_ERROR_TEXT: Record<NonNullable<WorkspaceReadFileResult["error"]>, string> = {
  too_large: "文件过大，暂不在此预览。",
  not_found: "文件不存在或已被移动。",
  not_a_file: "这是一个目录，不是 Markdown 文件。",
  escapes_root: "路径超出工作区范围，已拒绝读取。",
};

export const DOCS_SAVE_ERROR_TEXT: Record<string, string> = {
  not_found: "文件已不存在，无法保存。",
  escapes_root: "路径超出工作区范围，已拒绝保存。",
  not_markdown: "只能保存 Markdown 文件。",
  write_failed: "保存失败，请稍后重试。",
};

function docFromRead(relativePath: string, result: WorkspaceReadFileResult): DocsDocState {
  if (result.error) {
    return {
      relativePath,
      status: "error",
      message: READ_ERROR_TEXT[result.error],
      original: "",
      draft: "",
      mtimeMs: 0,
      size: 0,
      truncated: false,
      isStale: false,
    };
  }
  const content = result.content ?? "";
  return {
    relativePath,
    status: "ready",
    original: content,
    draft: content,
    mtimeMs: result.mtimeMs,
    size: result.size,
    truncated: Boolean(result.truncated),
    isStale: false,
  };
}

function loadingDoc(relativePath: string): DocsDocState {
  return { relativePath, status: "loading", original: "", draft: "", mtimeMs: 0, size: 0, truncated: false, isStale: false };
}

/**
 * 把草稿写回磁盘。成功返回 null，失败返回给用户看的说明。
 * 独立成函数：未保存离开的确认框在面板之外（标签栏关闭时面板可能没挂载），也要能保存。
 */
export async function saveDocsDoc(
  workspaceRoot: string | undefined,
  doc: DocsDocState,
  setDocsDoc: (update: (current: DocsDocState | null) => DocsDocState | null) => void,
): Promise<string | null> {
  if (!workspaceRoot) return "没有可写入的工作区。";
  if (!isDocsDocDirty(doc)) return null;
  const content = doc.draft;
  try {
    const result = await workspacesApi.writeMarkdownFile({ workspaceRoot, relativePath: doc.relativePath, content });
    if (result.ok === false) return DOCS_SAVE_ERROR_TEXT[result.error] ?? DOCS_SAVE_ERROR_TEXT.write_failed;
    setDocsDoc((current) => {
      if (!current || current.relativePath !== doc.relativePath) return current;
      // 保存期间用户可能又敲了字：原文只推进到刚写下去的那一版，之后的改动仍算未保存。
      return { ...current, original: content, mtimeMs: result.mtimeMs, size: result.size, isStale: false };
    });
    return null;
  } catch {
    return DOCS_SAVE_ERROR_TEXT.write_failed;
  }
}

export function useDocsDraft({
  workspaceRoot,
  revalidateKey,
  editedPaths,
  enabled = true,
}: {
  workspaceRoot?: string;
  /** 外部驱动的重校验触发器（当前会话 turn 结束时递增）。 */
  revalidateKey?: number;
  /** 当前会话里 Agent 改过的 Markdown（相对路径），命中当前文档就直接标「已变化」。 */
  editedPaths: ReadonlySet<string>;
  enabled?: boolean;
}) {
  const { docsSelectedPath, docsDoc, setDocsDoc } = useRightPanel();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 异步结果回来时要核对「现在选中的还是不是发起时那一篇、根是不是同一个」。
  const live = useRef({ path: docsSelectedPath, root: workspaceRoot, doc: docsDoc });
  live.current = { path: docsSelectedPath, root: workspaceRoot, doc: docsDoc };

  const load = useCallback(
    async (relativePath: string, root: string) => {
      let next: DocsDocState;
      try {
        next = docFromRead(relativePath, await workspacesApi.readFile({ workspaceRoot: root, relativePath }));
      } catch {
        next = { ...docFromRead(relativePath, { relativePath, renderKind: "markdown", size: 0, mtimeMs: 0, error: "not_found" }), message: "文件读取失败。" };
      }
      if (live.current.path !== relativePath || live.current.root !== root) return;
      // 换根前暂存的未保存草稿：套回去并带上未保存圆点；磁盘上的文件变过就同时提示已变化。不自动写盘。
      const stashed = next.status === "ready" && !next.truncated ? takeDocsDraft(root, relativePath) : null;
      if (stashed) {
        const changed = stashed.mtimeMs !== next.mtimeMs || stashed.size !== next.size;
        next = { ...next, original: stashed.original, draft: stashed.draft, isStale: changed };
      }
      setDocsDoc(next);
    },
    [setDocsDoc],
  );

  // 选中路径变化 → 读盘。面板重新挂载时，context 里已有同一篇就直接复用（保住草稿），新鲜度交给下面的重校验。
  useEffect(() => {
    setSaveError(null);
    if (!enabled || !workspaceRoot || !docsSelectedPath) return;
    if (live.current.doc?.relativePath === docsSelectedPath) return;
    setDocsDoc(loadingDoc(docsSelectedPath));
    void load(docsSelectedPath, workspaceRoot);
  }, [docsSelectedPath, workspaceRoot, enabled, load, setDocsDoc]);

  const revalidate = useCallback(async () => {
    const { doc, root } = live.current;
    if (!enabled || !root || !doc || doc.status !== "ready" || doc.isStale) return;
    try {
      const result = await workspacesApi.statFile({ workspaceRoot: root, relativePath: doc.relativePath });
      const current = live.current.doc;
      if (!current || current.relativePath !== doc.relativePath || current.isStale) return;
      if (result.error || result.mtimeMs !== current.mtimeMs || result.size !== current.size) {
        setDocsDoc((value) => (value && value.relativePath === doc.relativePath ? { ...value, isStale: true } : value));
      }
    } catch {
      // 偶发 IPC 失败保留当前内容，等下次触发重查。
    }
  }, [enabled, setDocsDoc]);

  // 时机一：挂载 / 换文档读完（基线刚建立）。
  const readyPath = docsDoc?.status === "ready" ? docsDoc.relativePath : null;
  useEffect(() => {
    if (readyPath) void revalidate();
  }, [readyPath, revalidate]);

  // 时机二：turn 结束（补上 Agent 用 bash 间接改文件的情况）。
  useEffect(() => {
    if (revalidateKey !== undefined) void revalidate();
  }, [revalidateKey, revalidate]);

  // 时机三：窗口重新获得焦点 / 页面重新可见（外部编辑器、git checkout）。
  useEffect(() => {
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

  // 信号：Agent 刚改过当前这一篇（edit_diff / write_diff 带路径，零成本）。
  // 只在「打开之后才出现在改过名单里」时触发：打开一篇本来就改过的文件，读到的就是最新内容，不该提示已变化。
  const edited = useRef<{ path: string | null; has: boolean }>({ path: null, has: false });
  useEffect(() => {
    const has = readyPath !== null && editedPaths.has(readyPath);
    const previous = edited.current;
    edited.current = { path: readyPath, has };
    if (readyPath === null || previous.path !== readyPath || previous.has || !has) return;
    setDocsDoc((value) => (value && value.relativePath === readyPath && !value.isStale ? { ...value, isStale: true } : value));
  }, [editedPaths, readyPath, setDocsDoc]);

  const setDraft = useCallback(
    (draft: string) => {
      setDocsDoc((value) => (value && value.status === "ready" && !value.truncated ? { ...value, draft } : value));
    },
    [setDocsDoc],
  );

  const save = useCallback(async (): Promise<boolean> => {
    const doc = live.current.doc;
    if (!doc || !isDocsDocDirty(doc)) return true;
    setSaving(true);
    setSaveError(null);
    const error = await saveDocsDoc(live.current.root, doc, setDocsDoc);
    setSaving(false);
    setSaveError(error);
    return error === null;
  }, [setDocsDoc]);

  const reload = useCallback(() => {
    const { path, root } = live.current;
    if (!path || !root) return;
    setSaveError(null);
    setDocsDoc(loadingDoc(path));
    void load(path, root);
  }, [load, setDocsDoc]);

  return { doc: docsDoc, saving, saveError, setDraft, save, reload };
}

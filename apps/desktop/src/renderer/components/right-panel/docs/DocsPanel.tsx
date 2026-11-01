import { useEffect } from "react";
import { useRightPanel } from "../RightPanelContext";
import { DocsReader } from "./DocsReader";
import { DocsTree } from "./DocsTree";
import { useDocsDraft } from "./use-docs-draft";
import { useDocsListing } from "./use-docs-listing";

/**
 * 「文档」面板外壳（见 `front-文档面板规范.md`）：左边正文，最右边目录树（可收起）。
 * 从左到右是聊天 → 正文 → 文件树，正文紧挨聊天区。
 * 草稿、选中文件、展开层级都在 `RightPanelContext`：面板随切标签、收起右栏反复卸载，状态不能留在这里。
 */

/** workspace 绝对路径的末段目录名，用作树顶和路径里的根标签。 */
function workspaceLabelOf(workspaceRoot: string | undefined): string {
  return workspaceRoot?.replace(/[/\\]+$/, "").split(/[/\\]/).filter(Boolean).at(-1) ?? "工作区";
}

export function DocsPanel({
  workspaceRoot,
  revalidateKey,
  editedPaths,
}: {
  workspaceRoot?: string;
  /** 递增即触发清单重新获取和当前文档的新鲜度重校验（当前会话 turn 结束时由 App 递增）。 */
  revalidateKey?: number;
  /** 当前会话里 Agent 写过 / 改过的 Markdown（工作区相对路径）。 */
  editedPaths: ReadonlySet<string>;
}) {
  const { docsTreeCollapsed, syncDocsRoot } = useRightPanel();

  // 换工作区后旧的选中、草稿、展开层级和清单都属于另一个根。「上次的根」记在 Provider 里，面板反复挂载卸载不会误判成换根。
  useEffect(() => {
    syncDocsRoot(workspaceRoot);
  }, [workspaceRoot, syncDocsRoot]);

  const { listing, status, error } = useDocsListing({ workspaceRoot, revalidateKey });
  const { doc, saveError, setDraft, save, reload } = useDocsDraft({ workspaceRoot, revalidateKey, editedPaths });
  const workspaceLabel = workspaceLabelOf(workspaceRoot);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
      <DocsReader
        workspaceRoot={workspaceRoot}
        workspaceLabel={workspaceLabel}
        doc={doc}
        saveError={saveError}
        onDraftChange={setDraft}
        onSave={() => void save()}
        onReload={reload}
        listingStatus={status}
        listingEmpty={listing !== null && listing.files.length === 0}
      />
      {docsTreeCollapsed || !workspaceRoot ? null : (
        <DocsTree
          workspaceLabel={workspaceLabel}
          files={listing?.files ?? null}
          truncated={listing?.truncated ?? false}
          status={status}
          error={error}
          editedPaths={editedPaths}
        />
      )}
    </div>
  );
}

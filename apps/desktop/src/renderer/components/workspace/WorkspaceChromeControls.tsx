import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  Check,
  Bookmark,
  ChevronDown,
  File,
  Folder,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequestArrow,
  Image,
  Laptop,
  Link,
  Loader2,
  MonitorUp,
  Plus,
  Search,
  X,
} from "lucide-react";
import type {
  GitBranchItem,
  MessageBlock,
  WorkspaceEnvironmentSnapshot,
  WorkspaceGitMutationResult,
} from "@actspace/shared";
import type { ComposerReviewSummary } from "../Composer";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";
import { Button } from "../ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/Dialog";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/Popover";
import { workspacesApi } from "../../api/workspaces";

const BRANCH_PREFIX_KEY = "actspace.workspace.branch-prefix.v1";
const DEFAULT_BRANCH_PREFIX = "actspace";

const ROW_CLASS =
  "flex min-h-8 w-full items-center gap-2 border-0 bg-transparent px-2.5 text-left text-act-sm text-text-main transition-colors hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring disabled:cursor-default disabled:text-text-faint disabled:hover:bg-transparent";
const MENU_ITEM_CLASS =
  "flex min-h-9 w-full items-center gap-2.5 rounded-act-md border-0 bg-transparent px-2.5 text-left text-act-sm text-text-main transition-colors hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-default disabled:text-text-faint disabled:hover:bg-transparent";
const INPUT_CLASS =
  "h-10 w-full rounded-act-md border border-line bg-surface-subtle px-3 text-act-sm text-text-main outline-none placeholder:text-text-subtle focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/20";

type GitDialogState =
  | { kind: "branch" }
  | { kind: "git" }
  | { kind: "remote"; action: "push" | "commit_and_push"; input?: GitCommitRequest; remotes: string[] }
  | null;

type GitCommitRequest = {
  message?: string;
  includeUnstagedChanges: boolean;
  branchName?: string;
};

type SourceItem = {
  id: string;
  kind: "workspace" | "file" | "image" | "link";
  label: string;
  detail?: string;
};

function slugifyBranchPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "new-work";
}

function sourceIcon(kind: SourceItem["kind"]) {
  if (kind === "workspace") return <Folder size={14} aria-hidden="true" />;
  if (kind === "image") return <Image size={14} aria-hidden="true" />;
  if (kind === "link") return <Link size={14} aria-hidden="true" />;
  return <File size={14} aria-hidden="true" />;
}

function collectSources(workspaceRoot: string, messages: MessageBlock[]): SourceItem[] {
  const sources = new Map<string, SourceItem>();
  const workspaceLabel = workspaceRoot.replace(/\/+$/, "").split("/").filter(Boolean).at(-1) ?? workspaceRoot;
  sources.set(`workspace:${workspaceRoot}`, {
    id: `workspace:${workspaceRoot}`,
    kind: "workspace",
    label: workspaceLabel,
    detail: workspaceRoot,
  });

  for (const message of messages) {
    if (message.kind !== "user") continue;
    for (const attachment of message.attachments ?? []) {
      const key = attachment.path || `${attachment.kind}:${attachment.name}`;
      if (sources.has(key)) continue;
      sources.set(key, {
        id: key,
        kind: attachment.kind === "image" ? "image" : attachment.kind === "link" ? "link" : "file",
        label: attachment.name,
        detail: attachment.path,
      });
    }
  }
  return [...sources.values()];
}

export function WorkspaceChromeControls({
  workspaceRoot,
  title,
  messages,
  reviewSummary,
  onOpenReview,
  onWorkspaceChanged,
}: {
  workspaceRoot: string;
  title: string;
  messages: MessageBlock[];
  reviewSummary?: ComposerReviewSummary | null;
  onOpenReview: () => void;
  onWorkspaceChanged?: () => void;
}) {
  const [environmentOpen, setEnvironmentOpen] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [environment, setEnvironment] = useState<WorkspaceEnvironmentSnapshot | null>(null);
  const [loadingEnvironment, setLoadingEnvironment] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "danger" | "neutral"; message: string } | null>(null);
  const [dialog, setDialog] = useState<GitDialogState>(null);
  const environmentToggleRef = useRef<HTMLButtonElement>(null);
  const sources = useMemo(() => collectSources(workspaceRoot, messages), [messages, workspaceRoot]);

  const loadEnvironment = async () => {
    const api = workspacesApi.getEnvironment;
    setLoadingEnvironment(true);
    try {
      setEnvironment(await api({ workspaceRoot }));
    } catch (error) {
      console.error("Failed to load workspace environment", error);
      setFeedback({ tone: "danger", message: error instanceof Error ? error.message : "加载工作区环境失败。" });
    } finally {
      setLoadingEnvironment(false);
    }
  };

  useEffect(() => {
    setEnvironment(null);
    setFeedback(null);
    setDialog(null);
    setEnvironmentOpen(false);
    setBranchMenuOpen(false);
  }, [workspaceRoot]);

  const closeDialog = () => setDialog(null);

  const handleMutationResult = async (result: WorkspaceGitMutationResult, closeMutationDialog = true) => {
    if (!result.ok && result.error === "remote_required" && result.remotes?.length) {
      return false;
    }
    if (result.ok) {
      const message = result.action === "create_branch"
        ? `已创建并切换到 ${result.branch}。`
        : result.action === "switch_branch"
          ? `已切换到 ${result.branch}。`
        : result.action === "commit"
          ? `已提交 ${result.commitHash ?? "工作区变更"}。`
          : result.action === "commit_and_push"
            ? `已提交 ${result.commitHash ?? "变更"}并推送。`
            : `已推送 ${result.branch ?? "分支"}。`;
      setEnvironmentOpen(true);
      setBranchMenuOpen(false);
      setFeedback({ tone: "success", message });
      if (closeMutationDialog) closeDialog();
      await loadEnvironment();
      window.dispatchEvent(new CustomEvent("actspace:workspace-git-changed", { detail: { workspaceRoot } }));
      onWorkspaceChanged?.();
      return true;
    }
    const prefix = result.commitCreated && result.commitHash ? `已创建提交 ${result.commitHash}。` : "";
    setEnvironmentOpen(true);
    setBranchMenuOpen(false);
    setFeedback({ tone: "danger", message: `${prefix}${result.message ?? "Git 操作失败。"}` });
    if (closeMutationDialog) closeDialog();
    await loadEnvironment();
    window.dispatchEvent(new CustomEvent("actspace:workspace-git-changed", { detail: { workspaceRoot } }));
    onWorkspaceChanged?.();
    return false;
  };

  const runPush = async (remote?: string) => {
    const api = workspacesApi.push;
    setBusy(true);
    try {
      const result = await api({ workspaceRoot, remote });
      if (!result.ok && result.error === "remote_required" && result.remotes?.length) {
        setDialog({ kind: "remote", action: "push", remotes: result.remotes });
      } else {
        await handleMutationResult(result);
      }
    } finally {
      setBusy(false);
    }
  };

  const switchBranch = async (branchName: string) => {
    if (branchName === environment?.git.branch) {
      setBranchMenuOpen(false);
      return;
    }
    const api = workspacesApi.switchBranch;
    setBusy(true);
    try {
      await handleMutationResult(await api({ workspaceRoot, branchName }), false);
    } finally {
      setBusy(false);
    }
  };

  const hasChanges = reviewSummary?.status === "changes" || reviewSummary?.status === "partial";
  const canOpenGitPanel = Boolean(environment?.git.repository && !busy);

  return (
    <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
      {/* 打开 Git 对话框时焦点移进对话框，环境浮层随之关闭；操作完成后重新打开它显示结果。 */}
      <Popover
        open={environmentOpen}
        onOpenChange={(next) => {
          // 分支菜单是嵌套的 Popover：外层因点外部、Esc、焦点移出关闭时，它自己也会先关闭。
          setEnvironmentOpen(next);
          if (next) {
            setFeedback(null);
            void loadEnvironment();
          }
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button ref={environmentToggleRef} type="button" className="chrome-button" aria-label="查看工作区环境">
                <Bookmark size={15} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>工作区环境</TooltipContent>
        </Tooltip>
        <PopoverContent aria-label="工作区环境" align="end" sideOffset={8} radius="xl" className="w-[304px] overflow-hidden">
          <section className="p-2">
            <div className="flex items-center justify-between px-0.5 pb-1 text-act-xs font-medium text-text-faint">
              <span>工作区环境</span>
              {loadingEnvironment ? <Loader2 size={13} className="animate-spin" aria-label="正在加载工作区环境" /> : null}
            </div>
            <button type="button" className={ROW_CLASS} onClick={() => { onOpenReview(); setEnvironmentOpen(false); }}>
              <GitCommitHorizontal size={15} aria-hidden="true" />
              <span className="min-w-0 flex-1">变更</span>
              {reviewSummary?.status === "loading" ? <Loader2 size={13} className="animate-spin text-text-faint" aria-hidden="true" /> : hasChanges ? (
                <span className="flex items-center gap-1 font-medium">
                  <span className="text-success">+{reviewSummary?.additions ?? 0}</span>
                  <span className="text-danger">-{reviewSummary?.deletions ?? 0}</span>
                </span>
              ) : <span className="text-act-xs text-text-faint">无变更</span>}
            </button>
            <div className={ROW_CLASS} title={environment?.workspaceRoot ?? workspaceRoot}>
              <Laptop size={15} aria-hidden="true" />
              <span className="min-w-0 flex-1">{environment?.locationKind === "worktree" ? "工作树" : "本机"}</span>
            </div>
            {environment?.git.branch ? (
              <Popover open={branchMenuOpen} onOpenChange={setBranchMenuOpen}>
                <PopoverTrigger asChild>
                  <button type="button" className={ROW_CLASS} title={environment.git.branch} aria-haspopup="menu">
                    <GitBranch size={15} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{environment.git.branch}</span>
                    <ChevronDown size={13} className="text-text-faint" aria-hidden="true" />
                  </button>
                </PopoverTrigger>
                <BranchMenu
                  branches={environment.git.branches ?? [{ name: environment.git.branch, current: true }]}
                  busy={busy}
                  onSelect={(branchName) => void switchBranch(branchName)}
                  onCreate={() => {
                    setBranchMenuOpen(false);
                    setDialog({ kind: "branch" });
                  }}
                />
              </Popover>
            ) : (
              <button
                type="button"
                className={ROW_CLASS}
                disabled={busy}
                onClick={() => {
                  if (environment && !environment.git.repository) {
                    setFeedback({ tone: "neutral", message: "请先在变更页面初始化 Git，再创建分支。" });
                    return;
                  }
                  setDialog({ kind: "branch" });
                }}
              >
                <GitBranch size={15} aria-hidden="true" />
                <span className="min-w-0 flex-1">创建分支</span>
              </button>
            )}
            <button
              type="button"
              className={ROW_CLASS}
              disabled={!canOpenGitPanel}
              onClick={() => setDialog({ kind: "git" })}
            >
              <GitPullRequestArrow size={15} aria-hidden="true" />
              <span className="min-w-0 flex-1">提交或推送</span>
            </button>
          </section>

          <div className="h-px bg-line" />
          <section className="p-2">
            <div className="flex items-center justify-between px-0.5 pb-1 text-act-xs font-medium text-text-faint">
              <span>来源</span>
              <Plus size={13} aria-hidden="true" />
            </div>
            {sources.slice(0, 3).map((source) => (
              <div key={source.id} className={ROW_CLASS} title={source.detail ?? source.label}>
                {sourceIcon(source.kind)}
                <span className="min-w-0 flex-1 truncate">{source.label}</span>
              </div>
            ))}
            {sources.length > 3 ? (
              <details className="group">
                <summary className={`${ROW_CLASS} cursor-pointer list-none text-text-faint`}>
                  <Link size={14} aria-hidden="true" /> 查看全部
                </summary>
                {sources.slice(3).map((source) => (
                  <div key={source.id} className={`${ROW_CLASS} pl-6`} title={source.detail ?? source.label}>
                    {sourceIcon(source.kind)}
                    <span className="min-w-0 flex-1 truncate">{source.label}</span>
                  </div>
                ))}
              </details>
            ) : null}
          </section>
          {feedback ? (
            <div className={`border-t border-line px-3 py-2 text-act-xs leading-relaxed ${feedback.tone === "success" ? "text-success" : feedback.tone === "danger" ? "text-danger" : "text-text-muted"}`}>
              {feedback.message}
            </div>
          ) : null}
        </PopoverContent>
      </Popover>

      {dialog ? (
        <GitActionDialog
          state={dialog}
          title={title}
          environment={environment}
          additions={reviewSummary?.additions ?? 0}
          deletions={reviewSummary?.deletions ?? 0}
          hasChanges={hasChanges}
          busy={busy}
          returnFocus={environmentToggleRef}
          onClose={closeDialog}
          onCreateBranch={async (branchName) => {
            const api = workspacesApi.createBranch;
            setBusy(true);
            try {
              await handleMutationResult(await api({ workspaceRoot, branchName }));
            } finally {
              setBusy(false);
            }
          }}
          onGitAction={async (action, input) => {
            if (action === "push") {
              await runPush();
              return;
            }
            const api = action === "commit_and_push" ? workspacesApi.commitAndPush : workspacesApi.commit;
            setBusy(true);
            try {
              const result = await api({ workspaceRoot, ...input });
              if (!result.ok && result.error === "remote_required" && result.remotes?.length && action === "commit_and_push") {
                setDialog({ kind: "remote", action: "commit_and_push", input, remotes: result.remotes });
              } else {
                await handleMutationResult(result);
              }
            } finally {
              setBusy(false);
            }
          }}
          onSelectRemote={async (remote, action, input) => {
            setBusy(true);
            try {
              const result = action === "push"
                ? await workspacesApi.push({ workspaceRoot, remote })
                : await workspacesApi.commitAndPush({ workspaceRoot, ...(input ?? {}), remote });
              await handleMutationResult(result);
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}

/** 环境浮层里的分支菜单：嵌套 Popover，贴在分支按钮左侧（放不下翻到右侧），打开时聚焦搜索框。 */
function BranchMenu({
  branches,
  busy,
  onSelect,
  onCreate,
}: {
  branches: GitBranchItem[];
  busy: boolean;
  onSelect: (branchName: string) => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState("");
  const filteredBranches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return branches;
    return branches.filter((branch) => branch.name.toLocaleLowerCase().includes(normalized));
  }, [branches, query]);

  return (
    <PopoverContent role="menu" aria-label="分支" side="left" align="start" radius="xl" className="flex w-[288px] flex-col overflow-hidden">
      <div className="p-2">
        <label className="flex h-8 items-center gap-2 rounded-act-md border border-line bg-surface-subtle px-2.5 text-text-faint focus-within:border-focus-ring focus-within:ring-2 focus-within:ring-focus-ring/20">
          <Search size={13} aria-hidden="true" />
          <span className="sr-only">搜索分支</span>
          <input
            type="search"
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-act-sm text-text-main outline-none placeholder:text-text-faint"
            placeholder="搜索分支"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div className="px-2 pb-1 text-act-xs font-medium text-text-faint">分支</div>
      <div className="max-h-[240px] overflow-y-auto px-1.5 pb-1.5">
        {filteredBranches.length ? filteredBranches.map((branch) => {
          const occupied = Boolean(branch.checkedOutPath && !branch.current);
          return (
            <button
              key={branch.name}
              type="button"
              role="menuitemradio"
              aria-checked={branch.current}
              className={MENU_ITEM_CLASS}
              disabled={busy || occupied}
              title={occupied ? `已检出到 ${branch.checkedOutPath}` : branch.name}
              onClick={() => onSelect(branch.name)}
            >
              <GitBranch size={14} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{branch.name}</span>
              {occupied ? <span className="shrink-0 text-act-xxs text-text-faint">位于工作树</span> : null}
              {branch.current ? <Check size={13} className="shrink-0 text-text-main" aria-hidden="true" /> : null}
            </button>
          );
        }) : (
          <div className="px-2.5 py-4 text-center text-act-xs text-text-faint">暂无分支</div>
        )}
      </div>
      <div className="border-t border-line p-1.5">
        <button type="button" role="menuitem" className={MENU_ITEM_CLASS} disabled={busy} onClick={onCreate}>
          <Plus size={15} aria-hidden="true" />
          <span>创建并切换到新分支…</span>
        </button>
      </div>
    </PopoverContent>
  );
}

function GitActionDialog({
  state,
  title,
  environment,
  additions,
  deletions,
  hasChanges,
  busy,
  onClose,
  onCreateBranch,
  onGitAction,
  onSelectRemote,
  returnFocus,
}: {
  state: Exclude<GitDialogState, null>;
  title: string;
  environment: WorkspaceEnvironmentSnapshot | null;
  additions: number;
  deletions: number;
  hasChanges: boolean;
  busy: boolean;
  onClose: () => void;
  onCreateBranch: (branchName: string) => Promise<void>;
  onGitAction: (action: "commit" | "commit_and_push" | "push", input: GitCommitRequest) => Promise<void>;
  onSelectRemote: (remote: string, action: "push" | "commit_and_push", input?: GitCommitRequest) => Promise<void>;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const [prefix, setPrefix] = useState(() => window.localStorage.getItem(BRANCH_PREFIX_KEY) || DEFAULT_BRANCH_PREFIX);
  const [showPrefix, setShowPrefix] = useState(false);
  const [branchName, setBranchName] = useState(() => `${prefix}/${slugifyBranchPart(title)}`);
  const [message, setMessage] = useState("");
  const [includeUnstagedChanges, setIncludeUnstagedChanges] = useState(true);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const currentBranch = environment?.git.branch;
  const [useNewBranch, setUseNewBranch] = useState(() => !currentBranch);
  const commitInput: GitCommitRequest = {
    message: message.trim() || undefined,
    includeUnstagedChanges,
    branchName: useNewBranch ? branchName.trim() || undefined : undefined,
  };
  const canCommit = hasChanges && (!useNewBranch || Boolean(branchName.trim())) && !busy;
  const canPush = Boolean(currentBranch && !useNewBranch && !busy);

  return (
    // Git 操作进行中不能用 Esc 或点遮罩关闭，只能等它结束。
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent
        size="sm"
        className="overflow-hidden"
        returnFocus={returnFocus}
        withDescription={state.kind === "remote"}
        onKeyDown={(event) => {
          if (state.kind === "git" && event.key === "Enter" && (event.metaKey || event.ctrlKey) && canCommit) {
            event.preventDefault();
            void onGitAction("commit", commitInput);
          }
        }}
      >
        {state.kind === "branch" ? (
          <form onSubmit={(event) => { event.preventDefault(); if (!busy && branchName.trim()) void onCreateBranch(branchName); }}>
            <div className="flex items-center justify-between gap-4 px-5 pb-3 pt-5">
              <DialogTitle className="m-0 text-act-xl font-semibold text-text-main">创建并切换分支</DialogTitle>
              <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-act-md text-text-faint hover:bg-hover-overlay hover:text-text-main" aria-label="关闭 Git 操作" disabled={busy} onClick={onClose}>
                <X size={15} aria-hidden="true" />
              </button>
            </div>
            <div className="grid gap-3 px-5 pb-5">
              <div className="grid gap-1.5 text-act-xs font-medium text-text-muted">
                <div className="flex items-center justify-between">
                  分支名称
                  <button type="button" className="border-0 bg-transparent text-act-xs text-text-faint hover:text-text-main" onClick={() => setShowPrefix((value) => !value)}>设置前缀</button>
                </div>
                <input autoFocus aria-label="分支名称" className={INPUT_CLASS} value={branchName} onChange={(event) => setBranchName(event.target.value)} />
              </div>
              {showPrefix ? (
                <label className="grid gap-1.5 text-act-xs font-medium text-text-muted">
                  默认前缀
                  <input
                    className={INPUT_CLASS}
                    value={prefix}
                    onChange={(event) => {
                      const nextPrefix = event.target.value;
                      setPrefix(nextPrefix);
                      window.localStorage.setItem(BRANCH_PREFIX_KEY, nextPrefix);
                    }}
                  />
                </label>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
              <Button variant="secondary" size="md" disabled={busy} onClick={onClose}>关闭</Button>
              <Button type="submit" variant="primary" size="md" disabled={busy || !branchName.trim()}>
                {busy ? <Loader2 size={14} className="mr-2 animate-spin" aria-hidden="true" /> : null} 创建并切换
              </Button>
            </div>
          </form>
        ) : null}

        {state.kind === "git" ? (
          <div>
            <DialogTitle className="sr-only">提交或推送</DialogTitle>
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="relative">
                <button
                  type="button"
                  className="flex h-8 items-center gap-2 rounded-act-md border-0 bg-transparent px-2 text-act-sm font-medium text-text-main hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  aria-haspopup="menu"
                  aria-expanded={branchMenuOpen}
                  onClick={() => setBranchMenuOpen((value) => !value)}
                >
                  <GitBranch size={14} aria-hidden="true" />
                  <span>{useNewBranch ? "新分支" : currentBranch}</span>
                  <ChevronDown size={13} aria-hidden="true" />
                </button>
                {branchMenuOpen ? (
                  <div className="absolute left-0 top-[calc(100%+4px)] z-10 min-w-[190px] rounded-act-lg border border-line bg-surface-raised p-1.5 shadow-act-popover" role="menu" aria-label="提交到分支">
                    {currentBranch ? (
                      <button type="button" role="menuitem" className={MENU_ITEM_CLASS} onClick={() => { setUseNewBranch(false); setBranchMenuOpen(false); }}>
                        <GitBranch size={14} aria-hidden="true" /> {currentBranch}
                      </button>
                    ) : null}
                    <button type="button" role="menuitem" className={MENU_ITEM_CLASS} onClick={() => { setUseNewBranch(true); setBranchMenuOpen(false); }}>
                      <Plus size={14} aria-hidden="true" /> 新分支
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-1 text-act-sm font-medium">
                <span className="text-success">+{additions}</span>
                <span className="text-danger">-{deletions}</span>
              </div>
            </div>

            <div className="grid gap-3 px-4 py-3">
              {useNewBranch ? (
                <input autoFocus aria-label="分支名称" className={INPUT_CLASS} value={branchName} onChange={(event) => setBranchName(event.target.value)} />
              ) : null}
              <input
                autoFocus={!useNewBranch}
                aria-label="提交说明"
                className={INPUT_CLASS}
                value={message}
                placeholder="提交说明（留空则自动生成）…"
                onChange={(event) => setMessage(event.target.value)}
              />
              <label className="flex min-h-9 cursor-pointer items-center gap-2 text-act-sm text-text-main">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-line accent-action"
                  checked={includeUnstagedChanges}
                  onChange={(event) => setIncludeUnstagedChanges(event.target.checked)}
                />
                包含未暂存的变更
              </label>
            </div>

            <div className="border-t border-line p-1.5">
              <button type="button" aria-label="提交" className="flex min-h-9 w-full items-center gap-2 rounded-act-md border-0 bg-hover-overlay px-2.5 text-left text-act-sm text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:text-text-faint" disabled={!canCommit} onClick={() => void onGitAction("commit", commitInput)}>
                <GitCommitHorizontal size={15} aria-hidden="true" />
                <span className="flex-1">提交</span>
                <kbd aria-hidden="true" className="rounded bg-surface-subtle px-1.5 py-0.5 text-act-xxs text-text-faint">⌘↵</kbd>
              </button>
              <button type="button" className={MENU_ITEM_CLASS} disabled={!canCommit} onClick={() => void onGitAction("commit_and_push", commitInput)}>
                <MonitorUp size={15} aria-hidden="true" /> 提交并推送
              </button>
              <button type="button" className={MENU_ITEM_CLASS} disabled={!canPush} onClick={() => void onGitAction("push", commitInput)}>
                <MonitorUp size={15} aria-hidden="true" /> 推送
              </button>
            </div>
          </div>
        ) : null}

        {state.kind === "remote" ? (
          <div className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <DialogTitle className="m-0 text-act-lg font-semibold text-text-main">选择远程仓库</DialogTitle>
                <DialogDescription className="mb-0 mt-1 text-act-sm text-text-muted">此仓库有多个推送目标。</DialogDescription>
              </div>
              <button type="button" className="grid h-8 w-8 place-items-center rounded-act-md text-text-faint hover:bg-hover-overlay hover:text-text-main" aria-label="关闭 Git 操作" onClick={onClose}>
                <X size={15} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4 grid gap-2">
              {state.remotes.map((remote) => (
                <button key={remote} type="button" className="flex h-10 items-center gap-2 rounded-act-md border border-line bg-surface px-3 text-left text-act-sm font-medium text-text-main transition hover:border-line-strong hover:bg-surface-subtle" disabled={busy} onClick={() => void onSelectRemote(remote, state.action, state.input)}>
                  <MonitorUp size={15} aria-hidden="true" /> {remote}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

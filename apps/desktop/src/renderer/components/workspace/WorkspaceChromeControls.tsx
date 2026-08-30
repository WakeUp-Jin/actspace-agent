import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
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
  WorkspaceOpenTool,
  WorkspaceOpenToolId,
} from "@actspace/shared";
import type { ComposerReviewSummary } from "../Composer";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";
import { OPEN_TOOL_LABELS, readStoredOpenTool, storeOpenTool, toolIcon } from "./workspaceOpenTool";

const BRANCH_PREFIX_KEY = "actspace.workspace.branch-prefix.v1";
const DEFAULT_BRANCH_PREFIX = "actspace";

const POPOVER_CLASS =
  "absolute right-0 top-[calc(100%+8px)] z-[90] w-[304px] max-w-[calc(100vw-16px)] overflow-hidden rounded-act-xl border border-line bg-surface-raised shadow-act-popover [-webkit-app-region:no-drag]";
const ROW_CLASS =
  "flex min-h-8 w-full items-center gap-2 border-0 bg-transparent px-2.5 text-left text-[13px] text-text-main transition-colors hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring disabled:cursor-default disabled:text-text-faint disabled:hover:bg-transparent";
const MENU_CLASS =
  "absolute right-0 top-[calc(100%+6px)] z-[95] min-w-[202px] overflow-hidden rounded-act-lg border border-line bg-surface-raised p-1.5 shadow-act-popover [-webkit-app-region:no-drag]";
const MENU_ITEM_CLASS =
  "flex min-h-9 w-full items-center gap-2.5 rounded-act-md border-0 bg-transparent px-2.5 text-left text-[13px] text-text-main transition-colors hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-default disabled:text-text-faint disabled:hover:bg-transparent";
const DIALOG_OVERLAY_CLASS = "fixed inset-0 z-[150] grid place-items-center bg-scrim px-4 [-webkit-app-region:no-drag]";
const DIALOG_CLASS = "w-full max-w-[420px] overflow-hidden rounded-act-xl border border-line bg-surface shadow-act-float";
const INPUT_CLASS =
  "h-10 w-full rounded-act-md border border-line bg-surface-subtle px-3 text-[13px] text-text-main outline-none placeholder:text-text-subtle focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/20";
const PRIMARY_BUTTON_CLASS =
  "inline-flex h-9 items-center justify-center rounded-act-md bg-action px-4 text-[13px] font-semibold text-on-action transition hover:bg-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON_CLASS =
  "inline-flex h-9 items-center justify-center rounded-act-md border border-line bg-surface-subtle px-4 text-[13px] font-medium text-text-main transition hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50";

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
  const [preferredTool, setPreferredTool] = useState<WorkspaceOpenToolId>(readStoredOpenTool);
  const [tools, setTools] = useState<WorkspaceOpenTool[]>([]);
  const [toolMenuOpen, setToolMenuOpen] = useState(false);
  const [environmentOpen, setEnvironmentOpen] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [environment, setEnvironment] = useState<WorkspaceEnvironmentSnapshot | null>(null);
  const [loadingEnvironment, setLoadingEnvironment] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "danger" | "neutral"; message: string } | null>(null);
  const [dialog, setDialog] = useState<GitDialogState>(null);
  const toolAnchorRef = useRef<HTMLDivElement>(null);
  const environmentAnchorRef = useRef<HTMLDivElement>(null);
  const branchAnchorRef = useRef<HTMLButtonElement>(null);
  const branchMenuRef = useRef<HTMLDivElement>(null);
  const toolToggleRef = useRef<HTMLButtonElement>(null);
  const environmentToggleRef = useRef<HTMLButtonElement>(null);
  const sources = useMemo(() => collectSources(workspaceRoot, messages), [messages, workspaceRoot]);

  const loadTools = async () => {
    const api = window.actspace?.listWorkspaceOpenTools;
    if (!api) return;
    try {
      const result = await api();
      setTools(result.tools);
      const selected = result.tools.find((tool) => tool.id === preferredTool);
      if (selected && !selected.available) {
        setPreferredTool("finder");
        storeOpenTool("finder");
      }
    } catch (error) {
      console.error("Failed to list workspace tools", error);
    }
  };

  const loadEnvironment = async () => {
    const api = window.actspace?.getWorkspaceEnvironment;
    if (!api) {
      setEnvironment(null);
      return;
    }
    setLoadingEnvironment(true);
    try {
      setEnvironment(await api({ workspaceRoot }));
    } catch (error) {
      console.error("Failed to load workspace environment", error);
      setFeedback({ tone: "danger", message: error instanceof Error ? error.message : "Failed to load Environment." });
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
    setToolMenuOpen(false);
    void loadTools();
  }, [workspaceRoot]);

  useEffect(() => {
    if (!toolMenuOpen && !environmentOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!toolAnchorRef.current?.contains(target)) setToolMenuOpen(false);
      const insideBranchMenu = branchMenuRef.current?.contains(target);
      const insideEnvironment = environmentAnchorRef.current?.contains(target);
      if (!insideEnvironment && !insideBranchMenu) {
        setEnvironmentOpen(false);
        setBranchMenuOpen(false);
      } else if (branchMenuOpen && !insideBranchMenu && !branchAnchorRef.current?.contains(target)) {
        setBranchMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (branchMenuOpen) {
        setBranchMenuOpen(false);
        queueMicrotask(() => branchAnchorRef.current?.focus());
        return;
      }
      const focusTarget = toolMenuOpen ? toolToggleRef.current : environmentToggleRef.current;
      setToolMenuOpen(false);
      setEnvironmentOpen(false);
      queueMicrotask(() => focusTarget?.focus());
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [branchMenuOpen, environmentOpen, toolMenuOpen]);

  const openInTool = async (toolId: WorkspaceOpenToolId) => {
    const api = window.actspace?.openWorkspaceInTool;
    if (!api) {
      setFeedback({ tone: "danger", message: "Opening local apps is available in the desktop app." });
      return;
    }
    setBusy(true);
    try {
      const result = await api({ workspaceRoot, toolId });
      if (!result.ok) {
        setFeedback({ tone: "danger", message: result.message ?? "Failed to open workspace." });
        return;
      }
      setPreferredTool(toolId);
      storeOpenTool(toolId);
      setToolMenuOpen(false);
    } catch (error) {
      setFeedback({ tone: "danger", message: error instanceof Error ? error.message : "Failed to open workspace." });
    } finally {
      setBusy(false);
    }
  };

  const closeDialog = () => {
    setDialog(null);
    queueMicrotask(() => environmentToggleRef.current?.focus());
  };

  const handleMutationResult = async (result: WorkspaceGitMutationResult, closeMutationDialog = true) => {
    if (!result.ok && result.error === "remote_required" && result.remotes?.length) {
      return false;
    }
    if (result.ok) {
      const message = result.action === "create_branch"
        ? `Created and checked out ${result.branch}.`
        : result.action === "switch_branch"
          ? `Switched to ${result.branch}.`
        : result.action === "commit"
          ? `Committed ${result.commitHash ?? "workspace changes"}.`
          : result.action === "commit_and_push"
            ? `Committed ${result.commitHash ?? "changes"} and pushed.`
            : `Pushed ${result.branch ?? "branch"}.`;
      setEnvironmentOpen(true);
      setBranchMenuOpen(false);
      setFeedback({ tone: "success", message });
      if (closeMutationDialog) closeDialog();
      await loadEnvironment();
      window.dispatchEvent(new CustomEvent("actspace:workspace-git-changed", { detail: { workspaceRoot } }));
      onWorkspaceChanged?.();
      return true;
    }
    const prefix = result.commitCreated && result.commitHash ? `Commit ${result.commitHash} was created. ` : "";
    setEnvironmentOpen(true);
    setBranchMenuOpen(false);
    setFeedback({ tone: "danger", message: `${prefix}${result.message ?? "Git action failed."}` });
    if (closeMutationDialog) closeDialog();
    await loadEnvironment();
    window.dispatchEvent(new CustomEvent("actspace:workspace-git-changed", { detail: { workspaceRoot } }));
    onWorkspaceChanged?.();
    return false;
  };

  const runPush = async (remote?: string) => {
    const api = window.actspace?.pushWorkspaceBranch;
    if (!api) return;
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
      queueMicrotask(() => branchAnchorRef.current?.focus());
      return;
    }
    const api = window.actspace?.switchWorkspaceBranch;
    if (!api) {
      setFeedback({ tone: "danger", message: "Switching branches is available in the desktop app." });
      return;
    }
    setBusy(true);
    try {
      await handleMutationResult(await api({ workspaceRoot, branchName }), false);
    } finally {
      setBusy(false);
    }
  };

  const preferredToolView = tools.find((tool) => tool.id === preferredTool) ?? {
    id: preferredTool,
    label: OPEN_TOOL_LABELS[preferredTool],
    available: true,
  };
  const hasChanges = reviewSummary?.status === "changes" || reviewSummary?.status === "partial";
  const canOpenGitPanel = Boolean(environment?.git.repository && !busy);

  return (
    <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
      <div ref={toolAnchorRef} className="relative flex items-center rounded-act-md border border-line bg-surface/80">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="grid h-[24px] w-[26px] place-items-center rounded-l-act-md text-text-muted transition hover:bg-hover-overlay hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
              aria-label={`Open workspace in ${preferredToolView.label}`}
              disabled={busy}
              onClick={() => void openInTool(preferredTool)}
            >
              {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : toolIcon(preferredToolView)}
            </button>
          </TooltipTrigger>
          <TooltipContent>Open in {preferredToolView.label}</TooltipContent>
        </Tooltip>
        <button
          ref={toolToggleRef}
          type="button"
          className="grid h-[24px] w-[18px] place-items-center rounded-r-act-md border-0 bg-transparent text-text-faint transition hover:bg-hover-overlay hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          aria-label="Choose workspace app"
          aria-haspopup="menu"
          aria-expanded={toolMenuOpen}
          onClick={() => {
            const next = !toolMenuOpen;
            setToolMenuOpen(next);
            if (next) void loadTools();
          }}
        >
          <ChevronDown size={12} aria-hidden="true" />
        </button>
        {toolMenuOpen ? (
          <div className={MENU_CLASS} role="menu" aria-label="Workspace apps">
            {(tools.length ? tools : [preferredToolView]).map((tool) => (
              <button
                key={tool.id}
                type="button"
                role="menuitem"
                className={MENU_ITEM_CLASS}
                disabled={!tool.available}
                onClick={() => void openInTool(tool.id)}
              >
                {toolIcon(tool, 16)}
                <span className="min-w-0 flex-1 truncate">{tool.label}</span>
                {!tool.available ? <span className="text-[11px] text-text-faint">Not installed</span> : null}
                {tool.id === preferredTool && tool.available ? <Check size={13} className="text-success" aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div ref={environmentAnchorRef} className="relative flex items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              ref={environmentToggleRef}
              type="button"
              className="chrome-button"
              aria-label="Show workspace environment"
              aria-haspopup="dialog"
              aria-expanded={environmentOpen}
              onClick={() => {
                const next = !environmentOpen;
                setEnvironmentOpen(next);
                if (!next) setBranchMenuOpen(false);
                if (next) {
                  setFeedback(null);
                  void loadEnvironment();
                }
              }}
            >
              <Bookmark size={15} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Workspace environment</TooltipContent>
        </Tooltip>

        {environmentOpen ? (
          <div className={POPOVER_CLASS} role="dialog" aria-label="Workspace environment">
            <section className="p-2">
              <div className="flex items-center justify-between px-0.5 pb-1 text-[12px] font-medium text-text-faint">
                <span>Environment</span>
                {loadingEnvironment ? <Loader2 size={13} className="animate-spin" aria-label="Loading environment" /> : null}
              </div>
              <button type="button" className={ROW_CLASS} onClick={() => { onOpenReview(); setEnvironmentOpen(false); }}>
                <GitCommitHorizontal size={15} aria-hidden="true" />
                <span className="min-w-0 flex-1">Changes</span>
                {reviewSummary?.status === "loading" ? <Loader2 size={13} className="animate-spin text-text-faint" aria-hidden="true" /> : hasChanges ? (
                  <span className="flex items-center gap-1 font-medium">
                    <span className="text-success">+{reviewSummary?.additions ?? 0}</span>
                    <span className="text-danger">-{reviewSummary?.deletions ?? 0}</span>
                  </span>
                ) : <span className="text-[12px] text-text-faint">Clean</span>}
              </button>
              <div className={ROW_CLASS} title={environment?.workspaceRoot ?? workspaceRoot}>
                <Laptop size={15} aria-hidden="true" />
                <span className="min-w-0 flex-1">{environment?.locationKind === "worktree" ? "Worktree" : "This Mac"}</span>
              </div>
              {environment?.git.branch ? (
                <button
                  ref={branchAnchorRef}
                  type="button"
                  className={ROW_CLASS}
                  title={environment.git.branch}
                  aria-haspopup="menu"
                  aria-expanded={branchMenuOpen}
                  onClick={() => setBranchMenuOpen((value) => !value)}
                >
                  <GitBranch size={15} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{environment.git.branch}</span>
                  <ChevronDown size={13} className="text-text-faint" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  className={ROW_CLASS}
                  disabled={busy}
                  onClick={() => {
                    if (environment && !environment.git.repository) {
                      setFeedback({ tone: "neutral", message: "Initialize Git from Changes before creating a branch." });
                      return;
                    }
                    setDialog({ kind: "branch" });
                  }}
                >
                  <GitBranch size={15} aria-hidden="true" />
                  <span className="min-w-0 flex-1">Create branch</span>
                </button>
              )}
              <button
                type="button"
                className={ROW_CLASS}
                disabled={!canOpenGitPanel}
                onClick={() => setDialog({ kind: "git" })}
              >
                <GitPullRequestArrow size={15} aria-hidden="true" />
                <span className="min-w-0 flex-1">Commit or push</span>
              </button>
            </section>

            <div className="h-px bg-line" />
            <section className="p-2">
              <div className="flex items-center justify-between px-0.5 pb-1 text-[12px] font-medium text-text-faint">
                <span>Sources</span>
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
                    <Link size={14} aria-hidden="true" /> View all
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
              <div className={`border-t border-line px-3 py-2 text-[12px] leading-relaxed ${feedback.tone === "success" ? "text-success" : feedback.tone === "danger" ? "text-danger" : "text-text-muted"}`}>
                {feedback.message}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {branchMenuOpen && environment?.git.branch ? (
        <BranchMenu
          anchorRef={branchAnchorRef}
          menuRef={branchMenuRef}
          branches={environment.git.branches ?? [{ name: environment.git.branch, current: true }]}
          busy={busy}
          onSelect={(branchName) => void switchBranch(branchName)}
          onCreate={() => {
            setBranchMenuOpen(false);
            setDialog({ kind: "branch" });
          }}
        />
      ) : null}

      {dialog ? (
        <GitActionDialog
          state={dialog}
          title={title}
          environment={environment}
          additions={reviewSummary?.additions ?? 0}
          deletions={reviewSummary?.deletions ?? 0}
          hasChanges={hasChanges}
          busy={busy}
          onClose={closeDialog}
          onCreateBranch={async (branchName) => {
            const api = window.actspace?.createWorkspaceBranch;
            if (!api) return;
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
            const api = action === "commit_and_push" ? window.actspace?.commitAndPushWorkspaceChanges : window.actspace?.commitWorkspaceChanges;
            if (!api) return;
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
                ? await window.actspace!.pushWorkspaceBranch!({ workspaceRoot, remote })
                : await window.actspace!.commitAndPushWorkspaceChanges!({ workspaceRoot, ...(input ?? {}), remote });
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

function BranchMenu({
  anchorRef,
  menuRef,
  branches,
  busy,
  onSelect,
  onCreate,
}: {
  anchorRef: RefObject<HTMLButtonElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  branches: GitBranchItem[];
  busy: boolean;
  onSelect: (branchName: string) => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });
  const filteredBranches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return branches;
    return branches.filter((branch) => branch.name.toLocaleLowerCase().includes(normalized));
  }, [branches, query]);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;
    const updatePosition = () => {
      const anchorRect = anchor.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const viewportPadding = 8;
      const gap = 6;
      const preferredLeft = anchorRect.left - menuRect.width - gap;
      const fallbackLeft = anchorRect.right + gap;
      const availableLeft = preferredLeft >= viewportPadding ? preferredLeft : fallbackLeft;
      const left = Math.min(Math.max(viewportPadding, availableLeft), window.innerWidth - menuRect.width - viewportPadding);
      const top = Math.min(
        Math.max(viewportPadding, anchorRect.top),
        window.innerHeight - menuRect.height - viewportPadding,
      );
      setPosition({ left, top });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, menuRef]);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[120] flex w-[288px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-act-xl border border-line bg-surface-raised shadow-act-popover [-webkit-app-region:no-drag]"
      role="menu"
      aria-label="Branches"
      style={position}
    >
      <div className="p-2">
        <label className="flex h-8 items-center gap-2 rounded-act-md border border-line bg-surface-subtle px-2.5 text-text-faint focus-within:border-focus-ring focus-within:ring-2 focus-within:ring-focus-ring/20">
          <Search size={13} aria-hidden="true" />
          <span className="sr-only">Search branches</span>
          <input
            autoFocus
            type="search"
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-text-main outline-none placeholder:text-text-faint"
            placeholder="Search branches"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div className="px-2 pb-1 text-[12px] font-medium text-text-faint">Branches</div>
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
              title={occupied ? `Checked out in ${branch.checkedOutPath}` : branch.name}
              onClick={() => onSelect(branch.name)}
            >
              <GitBranch size={14} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{branch.name}</span>
              {occupied ? <span className="shrink-0 text-[11px] text-text-faint">In worktree</span> : null}
              {branch.current ? <Check size={13} className="shrink-0 text-text-main" aria-hidden="true" /> : null}
            </button>
          );
        }) : (
          <div className="px-2.5 py-4 text-center text-[12px] text-text-faint">No branches found</div>
        )}
      </div>
      <div className="border-t border-line p-1.5">
        <button type="button" role="menuitem" className={MENU_ITEM_CLASS} disabled={busy} onClick={onCreate}>
          <Plus size={15} aria-hidden="true" />
          <span>Create and checkout new branch...</span>
        </button>
      </div>
    </div>,
    document.body,
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
      if (state.kind === "git" && event.key === "Enter" && (event.metaKey || event.ctrlKey) && canCommit) {
        event.preventDefault();
        void onGitAction("commit", commitInput);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [branchName, busy, canCommit, includeUnstagedChanges, message, onClose, onGitAction, state.kind, useNewBranch]);

  const dialogTitle = state.kind === "branch" ? "Create and checkout branch" : state.kind === "git" ? "Commit or push" : "Choose remote";

  return (
    <div className={DIALOG_OVERLAY_CLASS} role="presentation" onMouseDown={() => { if (!busy) onClose(); }}>
      <div className={DIALOG_CLASS} role="dialog" aria-modal="true" aria-label={dialogTitle} onMouseDown={(event) => event.stopPropagation()}>
        {state.kind === "branch" ? (
          <form onSubmit={(event) => { event.preventDefault(); if (!busy && branchName.trim()) void onCreateBranch(branchName); }}>
            <div className="flex items-center justify-between gap-4 px-5 pb-3 pt-5">
              <h2 className="m-0 text-[20px] font-semibold text-text-main">Create and checkout branch</h2>
              <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-act-md text-text-faint hover:bg-hover-overlay hover:text-text-main" aria-label="Close Git action" disabled={busy} onClick={onClose}>
                <X size={15} aria-hidden="true" />
              </button>
            </div>
            <div className="grid gap-3 px-5 pb-5">
              <div className="grid gap-1.5 text-[12px] font-medium text-text-muted">
                <div className="flex items-center justify-between">
                  Branch name
                  <button type="button" className="border-0 bg-transparent text-[12px] text-text-faint hover:text-text-main" onClick={() => setShowPrefix((value) => !value)}>Set prefix</button>
                </div>
                <input autoFocus aria-label="Branch name" className={INPUT_CLASS} value={branchName} onChange={(event) => setBranchName(event.target.value)} />
              </div>
              {showPrefix ? (
                <label className="grid gap-1.5 text-[12px] font-medium text-text-muted">
                  Default prefix
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
              <button type="button" className={SECONDARY_BUTTON_CLASS} disabled={busy} onClick={onClose}>Close</button>
              <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={busy || !branchName.trim()}>
                {busy ? <Loader2 size={14} className="mr-2 animate-spin" aria-hidden="true" /> : null} Create and checkout
              </button>
            </div>
          </form>
        ) : null}

        {state.kind === "git" ? (
          <div>
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="relative">
                <button
                  type="button"
                  className="flex h-8 items-center gap-2 rounded-act-md border-0 bg-transparent px-2 text-[13px] font-medium text-text-main hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  aria-haspopup="menu"
                  aria-expanded={branchMenuOpen}
                  onClick={() => setBranchMenuOpen((value) => !value)}
                >
                  <GitBranch size={14} aria-hidden="true" />
                  <span>{useNewBranch ? "New branch" : currentBranch}</span>
                  <ChevronDown size={13} aria-hidden="true" />
                </button>
                {branchMenuOpen ? (
                  <div className="absolute left-0 top-[calc(100%+4px)] z-10 min-w-[190px] rounded-act-lg border border-line bg-surface-raised p-1.5 shadow-act-popover" role="menu" aria-label="Commit branch">
                    {currentBranch ? (
                      <button type="button" role="menuitem" className={MENU_ITEM_CLASS} onClick={() => { setUseNewBranch(false); setBranchMenuOpen(false); }}>
                        <GitBranch size={14} aria-hidden="true" /> {currentBranch}
                      </button>
                    ) : null}
                    <button type="button" role="menuitem" className={MENU_ITEM_CLASS} onClick={() => { setUseNewBranch(true); setBranchMenuOpen(false); }}>
                      <Plus size={14} aria-hidden="true" /> New branch
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-1 text-[13px] font-medium">
                <span className="text-success">+{additions}</span>
                <span className="text-danger">-{deletions}</span>
              </div>
            </div>

            <div className="grid gap-3 px-4 py-3">
              {useNewBranch ? (
                <input autoFocus aria-label="Branch name" className={INPUT_CLASS} value={branchName} onChange={(event) => setBranchName(event.target.value)} />
              ) : null}
              <input
                autoFocus={!useNewBranch}
                aria-label="Commit message"
                className={INPUT_CLASS}
                value={message}
                placeholder="Commit message (leave blank to generate)..."
                onChange={(event) => setMessage(event.target.value)}
              />
              <label className="flex min-h-9 cursor-pointer items-center gap-2 text-[13px] text-text-main">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-line accent-action"
                  checked={includeUnstagedChanges}
                  onChange={(event) => setIncludeUnstagedChanges(event.target.checked)}
                />
                Include unstaged changes
              </label>
            </div>

            <div className="border-t border-line p-1.5">
              <button type="button" aria-label="Commit" className="flex min-h-9 w-full items-center gap-2 rounded-act-md border-0 bg-hover-overlay px-2.5 text-left text-[13px] text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:text-text-faint" disabled={!canCommit} onClick={() => void onGitAction("commit", commitInput)}>
                <GitCommitHorizontal size={15} aria-hidden="true" />
                <span className="flex-1">Commit</span>
                <kbd aria-hidden="true" className="rounded bg-surface-subtle px-1.5 py-0.5 text-[11px] text-text-faint">⌘↵</kbd>
              </button>
              <button type="button" className={MENU_ITEM_CLASS} disabled={!canCommit} onClick={() => void onGitAction("commit_and_push", commitInput)}>
                <MonitorUp size={15} aria-hidden="true" /> Commit and push
              </button>
              <button type="button" className={MENU_ITEM_CLASS} disabled={!canPush} onClick={() => void onGitAction("push", commitInput)}>
                <MonitorUp size={15} aria-hidden="true" /> Push
              </button>
            </div>
          </div>
        ) : null}

        {state.kind === "remote" ? (
          <div className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="m-0 text-[18px] font-semibold text-text-main">Choose remote</h2>
                <p className="mb-0 mt-1 text-[13px] text-text-muted">This repository has multiple push destinations.</p>
              </div>
              <button type="button" className="grid h-8 w-8 place-items-center rounded-act-md text-text-faint hover:bg-hover-overlay hover:text-text-main" aria-label="Close Git action" onClick={onClose}>
                <X size={15} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4 grid gap-2">
              {state.remotes.map((remote) => (
                <button key={remote} type="button" className="flex h-10 items-center gap-2 rounded-act-md border border-line bg-surface px-3 text-left text-[13px] font-medium text-text-main transition hover:border-line-strong hover:bg-surface-subtle" disabled={busy} onClick={() => void onSelectRemote(remote, state.action, state.input)}>
                  <MonitorUp size={15} aria-hidden="true" /> {remote}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

import type { BrowserWindow } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { ReviewWorkspaceInput } from "@actspace/shared";
import { RUNTIME_V2_FIXED_RENDERER_CHANNELS } from "@actspace/shared/runtime-v2";
import { desktopBridgeContract as contract } from "@actspace/shared/desktop-bridge";
import { hasSessionLocatorPrefix } from "@actspace/shared/session-locator";
import type { AppDataRoots } from "../app-paths";
import { createIpcRegistrar } from "../ipc/registry";
import { readWorkspaceRegistry, resolveRegisteredWorkspaceSelection, type WorkspaceRegistryOptions } from "../workspace-registry-service";
import { openExternalSafely } from "../platform-actions";
import { createWorkspaceAccessDeps, resolveWorkspaceAccess, workspaceRegistryOptions } from "../workspace-access";
import { listWorkspaceDir, readWorkspaceFile, statWorkspaceFile } from "../workspace-fs-service";
import { ReviewCoordinator, type ResolvedReviewWorkspace } from "../review-coordinator";
import { ReviewGitEngine } from "../review-git-engine";
import { ReviewGitWorkerClient } from "../review-git-worker-client";
import { ReviewViewStateService } from "../review-view-state-service";
import { ReviewPullRequestService } from "../review-pr-service";
import { ReviewWorkspaceWatcher } from "../review-workspace-watcher";
import { createReviewIgnoredPathFilter } from "../review-ignore-filter";
import type { TerminalSessionService } from "../terminal/terminal-session-service";

type ShellOptions = {
  readonly roots: AppDataRoots;
  readonly getMainWindow: () => BrowserWindow | undefined;
  /** 本地会话列表，用来放行不在 registry 里的 worktree 会话路径。 */
  readonly listSessions: () => Promise<readonly { readonly workspaceRoot?: string | null }[]>;
  readonly terminal?: TerminalSessionService;
  readonly terminalAvailable?: boolean;
};

export function registerRuntimeV2DesktopShell(options: ShellOptions): { dispose(): void } {
  const registryOptions = workspaceRegistryOptions(options.roots);
  const workspaceAccess = createWorkspaceAccessDeps(registryOptions, options.listSessions);
  const withWorkspaceAccess = async <T extends { workspaceRoot?: string }>(input: T): Promise<T> => ({
    ...input,
    workspaceRoot: await resolveWorkspaceAccess({ workspaceRoot: input?.workspaceRoot ?? options.roots.defaultWorkspaceRoot }, workspaceAccess),
  });
  const resolveWorkspace = async (input: ReviewWorkspaceInput) => {
    const registered = await resolveReviewWorkspace(registryOptions, input);
    if (registered.ok || !input.workspaceRoot) return registered;
    // Persisted Session roots authorize generated worktrees without adding them to Recents.
    try {
      const workspaceRoot = await resolveWorkspaceAccess({ workspaceRoot: input.workspaceRoot }, workspaceAccess);
      return { ok: true as const, workspace: { workspaceRoot, workspaceId: `session-root:${createHash("sha256").update(workspaceRoot).digest("hex")}` } };
    } catch { return registered; }
  };
  const reviewWorker = new ReviewGitWorkerClient(join(__dirname, "..", "review-git-worker.js"));
  const reviewEngine = new ReviewGitEngine({ runner: reviewWorker.runGit, patchParser: reviewWorker.parsePatches, objectLoader: reviewWorker.loadGitObjects });
  const reviewWatcher = new ReviewWorkspaceWatcher();
  const review = new ReviewCoordinator({
    resolveWorkspace: async (input) => {
      const resolved = await resolveWorkspace(input);
      if (resolved.ok) {
        const { workspaceId, workspaceRoot } = resolved.workspace;
        await reviewWatcher.ensure(workspaceId, workspaceRoot, (path) => review.scheduleInvalidation(workspaceId, "watch", path === undefined ? undefined : { workspaceRoot, path }));
      }
      return resolved;
    },
    queryProvider: reviewEngine,
    mutationProvider: reviewEngine,
    filterWatchPaths: createReviewIgnoredPathFilter(reviewWorker.runGit),
    viewState: new ReviewViewStateService({ filePath: join(options.roots.dataRoot, "review", "view-state.json") }),
  });
  const reviewPullRequests = new ReviewPullRequestService();
  const unsubscribeReview = review.subscribe((notification) => {
    const target = options.getMainWindow();
    if (target && !target.isDestroyed()) {
      target.webContents.send(RUNTIME_V2_FIXED_RENDERER_CHANNELS.reviewChanged, notification);
    }
  });

  const terminalAvailable = options.terminalAvailable === true && options.terminal !== undefined;
  const ipc = createIpcRegistrar({
    getWindow: options.getMainWindow,
    untrustedMessage: "Untrusted shell sender",
    // 工作区、Review、终端都是本机能力，远端会话一律拒绝。
    middleware: (call, next) => {
      const input = call.input;
      if (input && typeof input === "object" && (("sessionId" in input && typeof input.sessionId === "string" && hasSessionLocatorPrefix(input.sessionId)) || ("hostId" in input && input.hostId))) throw new Error("Local shell capabilities are unavailable for remote Sessions");
      return next();
    },
  });

  ipc.handle(contract.workspaces.list, () => readWorkspaceRegistry(registryOptions));
  ipc.handle(contract.workspaces.listDir, async (input) => listWorkspaceDir(await withWorkspaceAccess(input), options.roots));
  ipc.handle(contract.workspaces.readFile, async (input) => readWorkspaceFile(await withWorkspaceAccess(input), options.roots));
  ipc.handle(contract.workspaces.statFile, async (input) => statWorkspaceFile(await withWorkspaceAccess(input), options.roots));
  ipc.handle(contract.review.getSnapshot, (input) => review.getSnapshot(input));
  ipc.handle(contract.review.refreshSnapshot, (input) => review.refreshSnapshot(input));
  ipc.handle(contract.review.getFileDiffs, (input) => review.getFileDiffs(input));
  ipc.handle(contract.review.getFileContents, (input) => review.getFileContents(input));
  ipc.handle(contract.review.applyMutation, (input) => review.applyMutation(input));
  ipc.handle(contract.review.setFileViewed, (input) => review.setFileViewed(input));
  ipc.handle(contract.review.listBranches, async (input) => {
    const resolved = await resolveWorkspace(input);
    if (resolved.ok === false) return { ok: false as const, code: "invalid_workspace" as const, message: resolved.message };
    try {
      return { ok: true as const, branches: await reviewEngine.listBranches(resolved.workspace) };
    } catch (error) {
      return { ok: false as const, code: "command_failed" as const, message: safeErrorMessage(error) };
    }
  });
  ipc.handle(contract.review.listCommits, async (input) => {
    const resolved = await resolveWorkspace(input);
    if (resolved.ok === false) return { ok: false as const, code: "invalid_workspace" as const, message: resolved.message };
    try {
      return { ok: true as const, commits: await reviewEngine.listCommits(resolved.workspace) };
    } catch (error) {
      return { ok: false as const, code: "command_failed" as const, message: safeErrorMessage(error) };
    }
  });
  ipc.handle(contract.review.copyGitApplyCommand, async (input) => {
    const loaded = await review.getLoadedSnapshot(input);
    if (loaded.ok === false) return loaded;
    try {
      const patch = await reviewEngine.createPatch(loaded.workspace, loaded.snapshot);
      const directory = join(options.roots.tmpRoot, "review-patches");
      await mkdir(directory, { recursive: true });
      const patchPath = join(directory, `${loaded.snapshot.id}.patch`);
      await writeFile(patchPath, patch, "utf8");
      return { ok: true as const, patchPath, command: `git apply -- ${quoteShellArgument(patchPath)}` };
    } catch (error) {
      return { ok: false as const, code: "command_failed" as const, message: safeErrorMessage(error) };
    }
  });
  ipc.handle(contract.review.getPullRequestCapability, async (input) => {
    const resolved = await resolveWorkspace(input);
    if (resolved.ok === false) return { ok: false as const, code: "invalid_workspace" as const, message: resolved.message };
    return reviewPullRequests.getCapability(resolved.workspace.workspaceRoot, input.baseBranch);
  });
  ipc.handle(contract.review.createPullRequest, async (input) => {
    const resolved = await resolveWorkspace(input);
    if (resolved.ok === false) return { ok: false as const, code: "invalid_workspace" as const, message: resolved.message };
    const result = await reviewPullRequests.create({
      workspaceRoot: resolved.workspace.workspaceRoot,
      title: input.title,
      body: input.body,
      baseBranch: input.baseBranch,
      draft: input.draft,
    });
    if (result.ok) await openExternalSafely(result.url);
    return result;
  });
  if (terminalAvailable && options.terminal) {
    ipc.handle(contract.terminal.create, (input, event) => options.terminal!.create(input.sessionId, event.sender.id, input.cols, input.rows));
    ipc.handle(contract.terminal.list, (input, event) => ({ terminals: options.terminal!.list(input.sessionId, event.sender.id) }));
    ipc.handle(contract.terminal.attach, (input, event) => options.terminal!.attach(input.terminalId, event.sender.id, input.cols, input.rows));
    ipc.handle(contract.terminal.detach, (input, event) => options.terminal!.detach(input.terminalId, event.sender.id));
    ipc.handle(contract.terminal.write, (input, event) => options.terminal!.write(input.terminalId, event.sender.id, input.data));
    ipc.handle(contract.terminal.resize, (input, event) => options.terminal!.resize(input.terminalId, event.sender.id, input.cols, input.rows));
    ipc.handle(contract.terminal.ack, (input, event) => options.terminal!.ack(input.terminalId, event.sender.id, input.bytes));
    ipc.handle(contract.terminal.close, (input, event) => options.terminal!.close(input.terminalId, event.sender.id));
  }

  return {
    dispose: () => {
      ipc.dispose();
      reviewWatcher.dispose();
      unsubscribeReview();
      review.dispose();
      reviewWorker.dispose();
    },
  };
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function quoteShellArgument(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function resolveReviewWorkspace(
  options: WorkspaceRegistryOptions,
  input: ReviewWorkspaceInput,
): Promise<{ ok: true; workspace: ResolvedReviewWorkspace } | { ok: false; message: string }> {
  const resolved = await resolveRegisteredWorkspaceSelection(options, {
    workspaceId: input.workspaceId,
    workspaceRoot: input.workspaceRoot,
  });
  if (resolved.ok === false) return { ok: false, message: resolved.error };
  return { ok: true, workspace: { workspaceId: resolved.workspaceId, workspaceRoot: resolved.workspaceRoot } };
}

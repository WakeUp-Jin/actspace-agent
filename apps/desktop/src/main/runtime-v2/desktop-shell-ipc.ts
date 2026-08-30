import { BrowserWindow, ipcMain, shell } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ReviewCopyApplyCommandInput,
  ReviewCreatePullRequestInput,
  ReviewGetFileContentsInput,
  ReviewGetFileDiffsInput,
  ReviewGetSnapshotInput,
  ReviewWorkspaceInput,
  WorkspaceListDirInput,
  WorkspaceReadFileInput,
  WorkspaceStatFileInput,
} from "@actspace/shared";
import { RUNTIME_V2_DESKTOP_SHELL_CHANNELS, RUNTIME_V2_FIXED_RENDERER_CHANNELS } from "@actspace/shared/runtime-v2";
import type { AppDataRoots } from "../app-paths";
import { readWorkspaceRegistry, resolveRegisteredWorkspaceSelection, type WorkspaceRegistryOptions } from "../workspace-registry-service";
import { listWorkspaceDir, readWorkspaceFile, statWorkspaceFile } from "../workspace-fs-service";
import { ReviewCoordinator, type ResolvedReviewWorkspace } from "../review-coordinator";
import { ReviewGitEngine } from "../review-git-engine";
import { ReviewGitWorkerClient } from "../review-git-worker-client";
import { ReviewViewStateService } from "../review-view-state-service";
import { ReviewPullRequestService } from "../review-pr-service";
import type { TerminalSessionService } from "../terminal/terminal-session-service";
import type { TerminalAckInput, TerminalAttachInput, TerminalCloseInput, TerminalCreateInput, TerminalDetachInput, TerminalListInput, TerminalResizeInput, TerminalWriteInput } from "@actspace/shared";

type ShellOptions = {
  readonly roots: AppDataRoots;
  readonly getMainWindow?: () => BrowserWindow | undefined;
  readonly terminal?: TerminalSessionService;
  readonly terminalAvailable?: boolean;
  readonly terminalUnavailableReason?: string;
};

export function registerRuntimeV2DesktopShell(options: ShellOptions): { dispose(): void } {
  const registryOptions = workspaceRegistryOptions(options.roots);
  const reviewWorker = new ReviewGitWorkerClient(join(__dirname, "..", "review-git-worker.js"));
  const reviewEngine = new ReviewGitEngine({ runner: reviewWorker.runGit, patchParser: reviewWorker.parsePatches, objectLoader: reviewWorker.loadGitObjects });
  const review = new ReviewCoordinator({
    resolveWorkspace: async (input) => resolveReviewWorkspace(registryOptions, input),
    queryProvider: reviewEngine,
    mutationProvider: reviewEngine,
    viewState: new ReviewViewStateService({ filePath: join(options.roots.dataRoot, "review", "view-state.json") }),
  });
  const reviewPullRequests = new ReviewPullRequestService();
  const unsubscribeReview = review.subscribe((notification) => {
    const target = options.getMainWindow?.();
    if (target && !target.isDestroyed()) {
      target.webContents.send(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.reviewChanged, notification);
      target.webContents.send(RUNTIME_V2_FIXED_RENDERER_CHANNELS.reviewChanged, notification);
    }
  });

  const terminalAvailable = options.terminalAvailable === true && options.terminal !== undefined;
  const handlers: string[] = [];
  const handle = <T extends unknown[]>(channel: string, listener: (...args: T) => unknown): void => {
    ipcMain.handle(channel, listener as never);
    handlers.push(channel);
  };

  handle(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.capabilities, () => ({
    workspace: { available: true },
    review: { available: true },
    terminal: { available: terminalAvailable, reason: terminalAvailable ? null : (options.terminalUnavailableReason ?? "Terminal capability is unavailable in this build.") },
  }));
  handle(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.listWorkspaces, () => readWorkspaceRegistry(registryOptions));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.listWorkspaces, () => readWorkspaceRegistry(registryOptions));
  handle(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.listWorkspaceDir, (_event: unknown, input: WorkspaceListDirInput) => listWorkspaceDir(input, options.roots));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.listWorkspaceDir, (_event: unknown, input: WorkspaceListDirInput) => listWorkspaceDir(input, options.roots));
  handle(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.readWorkspaceFile, (_event: unknown, input: WorkspaceReadFileInput) => readWorkspaceFile(input, options.roots));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.readWorkspaceFile, (_event: unknown, input: WorkspaceReadFileInput) => readWorkspaceFile(input, options.roots));
  handle(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.statWorkspaceFile, (_event: unknown, input: WorkspaceStatFileInput) => statWorkspaceFile(input, options.roots));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.statWorkspaceFile, (_event: unknown, input: WorkspaceStatFileInput) => statWorkspaceFile(input, options.roots));
  handle(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.getReviewSnapshot, (_event: unknown, input: ReviewGetSnapshotInput) => review.getSnapshot(input));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getReviewSnapshot, (_event: unknown, input: ReviewGetSnapshotInput) => review.getSnapshot(input));
  handle(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.refreshReviewSnapshot, (_event: unknown, input: ReviewGetSnapshotInput) => review.refreshSnapshot(input));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.refreshReviewSnapshot, (_event: unknown, input: ReviewGetSnapshotInput) => review.refreshSnapshot(input));
  handle(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.getReviewFileDiffs, (_event: unknown, input: ReviewGetFileDiffsInput) => review.getFileDiffs(input));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getReviewFileDiffs, (_event: unknown, input: ReviewGetFileDiffsInput) => review.getFileDiffs(input));
  handle(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.getReviewFileContents, (_event: unknown, input: ReviewGetFileContentsInput) => review.getFileContents(input));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getReviewFileContents, (_event: unknown, input: ReviewGetFileContentsInput) => review.getFileContents(input));
  handle(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.applyReviewMutation, (_event: unknown, input: Parameters<ReviewCoordinator["applyMutation"]>[0]) => review.applyMutation(input));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.applyReviewMutation, (_event: unknown, input: Parameters<ReviewCoordinator["applyMutation"]>[0]) => review.applyMutation(input));
  handle(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.setReviewFileViewed, (_event: unknown, input: Parameters<ReviewCoordinator["setFileViewed"]>[0]) => review.setFileViewed(input));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.setReviewFileViewed, (_event: unknown, input: Parameters<ReviewCoordinator["setFileViewed"]>[0]) => review.setFileViewed(input));
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.listReviewBranches, async (_event: unknown, input: ReviewWorkspaceInput) => {
    const resolved = await resolveReviewWorkspace(registryOptions, input);
    if (resolved.ok === false) return { ok: false as const, code: "invalid_workspace" as const, message: resolved.message };
    try {
      return { ok: true as const, branches: await reviewEngine.listBranches(resolved.workspace) };
    } catch (error) {
      return { ok: false as const, code: "command_failed" as const, message: safeErrorMessage(error) };
    }
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.listReviewCommits, async (_event: unknown, input: ReviewWorkspaceInput) => {
    const resolved = await resolveReviewWorkspace(registryOptions, input);
    if (resolved.ok === false) return { ok: false as const, code: "invalid_workspace" as const, message: resolved.message };
    try {
      return { ok: true as const, commits: await reviewEngine.listCommits(resolved.workspace) };
    } catch (error) {
      return { ok: false as const, code: "command_failed" as const, message: safeErrorMessage(error) };
    }
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.copyReviewGitApplyCommand, async (_event: unknown, input: ReviewCopyApplyCommandInput) => {
    const loaded = await review.getLoadedSnapshot(input);
    if (!loaded.ok) return loaded;
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
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getReviewPullRequestCapability, async (_event: unknown, input: ReviewWorkspaceInput & { baseBranch?: string }) => {
    const resolved = await resolveReviewWorkspace(registryOptions, input);
    if (resolved.ok === false) return { ok: false as const, code: "invalid_workspace" as const, message: resolved.message };
    return reviewPullRequests.getCapability(resolved.workspace.workspaceRoot, input.baseBranch);
  });
  handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.createReviewPullRequest, async (_event: unknown, input: ReviewCreatePullRequestInput) => {
    const resolved = await resolveReviewWorkspace(registryOptions, input);
    if (resolved.ok === false) return { ok: false as const, code: "invalid_workspace" as const, message: resolved.message };
    const result = await reviewPullRequests.create({
      workspaceRoot: resolved.workspace.workspaceRoot,
      title: input.title,
      body: input.body,
      baseBranch: input.baseBranch,
      draft: input.draft,
    });
    if (result.ok) await shell.openExternal(result.url);
    return result;
  });
  if (terminalAvailable && options.terminal) {
    handle(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.terminalCreate, (event: Electron.IpcMainInvokeEvent, input: TerminalCreateInput) => options.terminal!.create(input.sessionId, event.sender.id, input.cols, input.rows));
    handle(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.terminalList, (event: Electron.IpcMainInvokeEvent, input: TerminalListInput) => ({ terminals: options.terminal!.list(input.sessionId, event.sender.id) }));
    handle(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.terminalAttach, (event: Electron.IpcMainInvokeEvent, input: TerminalAttachInput) => options.terminal!.attach(input.terminalId, event.sender.id, input.cols, input.rows));
    handle(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.terminalDetach, (event: Electron.IpcMainInvokeEvent, input: TerminalDetachInput) => options.terminal!.detach(input.terminalId, event.sender.id));
    handle(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.terminalWrite, (event: Electron.IpcMainInvokeEvent, input: TerminalWriteInput) => options.terminal!.write(input.terminalId, event.sender.id, input.data));
    handle(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.terminalResize, (event: Electron.IpcMainInvokeEvent, input: TerminalResizeInput) => options.terminal!.resize(input.terminalId, event.sender.id, input.cols, input.rows));
    handle(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.terminalAck, (event: Electron.IpcMainInvokeEvent, input: TerminalAckInput) => options.terminal!.ack(input.terminalId, event.sender.id, input.bytes));
    handle(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.terminalClose, (event: Electron.IpcMainInvokeEvent, input: TerminalCloseInput) => options.terminal!.close(input.terminalId, event.sender.id));
    handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.terminalCreate, (event: Electron.IpcMainInvokeEvent, input: TerminalCreateInput) => options.terminal!.create(input.sessionId, event.sender.id, input.cols, input.rows));
    handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.terminalList, (event: Electron.IpcMainInvokeEvent, input: TerminalListInput) => ({ terminals: options.terminal!.list(input.sessionId, event.sender.id) }));
    handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.terminalAttach, (event: Electron.IpcMainInvokeEvent, input: TerminalAttachInput) => options.terminal!.attach(input.terminalId, event.sender.id, input.cols, input.rows));
    handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.terminalDetach, (event: Electron.IpcMainInvokeEvent, input: TerminalDetachInput) => options.terminal!.detach(input.terminalId, event.sender.id));
    handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.terminalWrite, (event: Electron.IpcMainInvokeEvent, input: TerminalWriteInput) => options.terminal!.write(input.terminalId, event.sender.id, input.data));
    handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.terminalResize, (event: Electron.IpcMainInvokeEvent, input: TerminalResizeInput) => options.terminal!.resize(input.terminalId, event.sender.id, input.cols, input.rows));
    handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.terminalAck, (event: Electron.IpcMainInvokeEvent, input: TerminalAckInput) => options.terminal!.ack(input.terminalId, event.sender.id, input.bytes));
    handle(RUNTIME_V2_FIXED_RENDERER_CHANNELS.terminalClose, (event: Electron.IpcMainInvokeEvent, input: TerminalCloseInput) => options.terminal!.close(input.terminalId, event.sender.id));
  }

  return {
    dispose: () => {
      for (const channel of handlers) ipcMain.removeHandler(channel);
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

function workspaceRegistryOptions(roots: AppDataRoots): WorkspaceRegistryOptions {
  return {
    dataRoot: roots.dataRoot,
    defaultWorkspaceRoot: roots.defaultWorkspaceRoot,
    fallbackWorkspaceRoot: roots.workspaceRoot,
  };
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

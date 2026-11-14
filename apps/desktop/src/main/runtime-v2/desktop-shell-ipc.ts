import type { BrowserWindow } from "electron";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { ReviewWorkspaceInput } from "@actspace/shared";
import { RUNTIME_FIXED_RENDERER_CHANNELS } from "@actspace/shared/runtime-v2";
import { desktopBridgeContract as contract } from "@actspace/shared/desktop-bridge";
import { hasSessionLocatorPrefix } from "@actspace/shared/session-locator";
import type { AppDataRoots } from "../app-paths";
import { createIpcRegistrar } from "../ipc/registry";
import {
  readWorkspaceRegistry,
  resolveRegisteredWorkspaceSelection,
  type WorkspaceRegistryOptions,
} from "../workspace-registry-service";
import { createWorkspaceAccessDeps, resolveWorkspaceAccess, workspaceRegistryOptions } from "../workspace-access";
import {
  listWorkspaceMarkdownFiles,
  readWorkspaceFile,
  statWorkspaceFile,
  writeWorkspaceMarkdownFile,
} from "../workspace-fs-service";
import { listWorkspaceFileApplications, openWorkspaceFile } from "../file-applications-service";
import { ReviewCoordinator, type ResolvedReviewWorkspace } from "../review-coordinator";
import { ReviewGitEngine } from "../review-git-engine";
import { ReviewGitWorkerClient } from "../review-git-worker-client";

type ShellOptions = {
  readonly roots: AppDataRoots;
  readonly getMainWindow: () => BrowserWindow | undefined;
  /** 本地会话列表，用来放行不在 registry 里的 worktree 会话路径。 */
  readonly listSessions: () => Promise<readonly { readonly workspaceRoot?: string | null }[]>;
};

export function registerRuntimeDesktopShell(options: ShellOptions): { dispose(): void } {
  const registryOptions = workspaceRegistryOptions(options.roots);
  const workspaceAccess = createWorkspaceAccessDeps(registryOptions, options.listSessions);
  const withWorkspaceAccess = async <T extends { workspaceRoot?: string }>(input: T): Promise<T> => ({
    ...input,
    workspaceRoot: await resolveWorkspaceAccess(
      { workspaceRoot: input?.workspaceRoot ?? options.roots.defaultWorkspaceRoot },
      workspaceAccess,
    ),
  });
  const resolveWorkspace = async (input: ReviewWorkspaceInput) => {
    const registered = await resolveReviewWorkspace(registryOptions, input);
    if (registered.ok || !input.workspaceRoot) return registered;
    // Persisted Session roots authorize generated worktrees without adding them to Recents.
    try {
      const workspaceRoot = await resolveWorkspaceAccess({ workspaceRoot: input.workspaceRoot }, workspaceAccess);
      const workspaceId = `session-root:${createHash("sha256").update(workspaceRoot).digest("hex")}`;
      if (input.workspaceId && input.workspaceId !== workspaceId) return registered;
      return { ok: true as const, workspace: { workspaceRoot, workspaceId } };
    } catch {
      return registered;
    }
  };
  const reviewWorker = new ReviewGitWorkerClient(join(__dirname, "..", "review-git-worker.js"));
  const reviewEngine = new ReviewGitEngine({
    runner: reviewWorker.runGit,
    patchParser: reviewWorker.parsePatches,
    objectLoader: reviewWorker.loadGitObjects,
  });
  const review = new ReviewCoordinator({ resolveWorkspace, queryProvider: reviewEngine });
  const unsubscribeReview = review.subscribe((notification) => {
    const target = options.getMainWindow();
    if (target && !target.isDestroyed()) {
      target.webContents.send(RUNTIME_FIXED_RENDERER_CHANNELS.reviewChanged, notification);
    }
  });

  const ipc = createIpcRegistrar({
    getWindow: options.getMainWindow,
    untrustedMessage: "Untrusted shell sender",
    // 工作区、Review、终端都是本机能力，远端会话一律拒绝。
    middleware: (call, next) => {
      const input = call.input;
      if (
        input &&
        typeof input === "object" &&
        (("sessionId" in input && typeof input.sessionId === "string" && hasSessionLocatorPrefix(input.sessionId)) ||
          ("hostId" in input && input.hostId))
      )
        throw new Error("Local shell capabilities are unavailable for remote Sessions");
      return next();
    },
  });

  ipc.handle(contract.workspaces.list, () => readWorkspaceRegistry(registryOptions));
  ipc.handle(contract.workspaces.listMarkdownFiles, async (input) =>
    listWorkspaceMarkdownFiles((await withWorkspaceAccess(input)).workspaceRoot, undefined, {
      expanded: input.expanded === true,
    }),
  );
  ipc.handle(contract.workspaces.readFile, async (input) =>
    readWorkspaceFile(await withWorkspaceAccess(input), options.roots),
  );
  ipc.handle(contract.workspaces.statFile, async (input) =>
    statWorkspaceFile(await withWorkspaceAccess(input), options.roots),
  );
  ipc.handle(contract.workspaces.writeMarkdownFile, async (input) =>
    writeWorkspaceMarkdownFile(await withWorkspaceAccess(input)),
  );
  ipc.handle(contract.workspaces.listFileApplications, async (input) =>
    listWorkspaceFileApplications(await withWorkspaceAccess(input), options.roots),
  );
  ipc.handle(contract.workspaces.openFile, async (input) =>
    openWorkspaceFile(await withWorkspaceAccess(input), options.roots),
  );
  ipc.handle(contract.review.getSnapshot, (input) => review.getSnapshot(input));
  ipc.handle(contract.review.refreshSnapshot, (input) => review.refreshSnapshot(input));
  ipc.handle(contract.review.getFileDiffs, (input) => review.getFileDiffs(input));
  ipc.handle(contract.review.getFileContents, (input) => review.getFileContents(input));
  ipc.handle(contract.review.listBranches, async (input) => {
    const resolved = await resolveWorkspace(input);
    if (resolved.ok === false)
      return { ok: false as const, code: "invalid_workspace" as const, message: resolved.message };
    try {
      return { ok: true as const, branches: await reviewEngine.listBranches(resolved.workspace) };
    } catch (error) {
      return { ok: false as const, code: "command_failed" as const, message: safeErrorMessage(error) };
    }
  });
  ipc.handle(contract.review.listCommits, async (input) => {
    const resolved = await resolveWorkspace(input);
    if (resolved.ok === false)
      return { ok: false as const, code: "invalid_workspace" as const, message: resolved.message };
    try {
      return { ok: true as const, commits: await reviewEngine.listCommits(resolved.workspace) };
    } catch (error) {
      return { ok: false as const, code: "command_failed" as const, message: safeErrorMessage(error) };
    }
  });

  return {
    dispose: () => {
      ipc.dispose();
      unsubscribeReview();
      review.dispose();
      reviewWorker.dispose();
    },
  };
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

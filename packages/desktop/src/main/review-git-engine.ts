import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import type {
  ReviewApplyMutationInput,
  ReviewBranch,
  ReviewCapabilities,
  ReviewDiffQueryOptions,
  ReviewDiffRequest,
  ReviewFileContentSide,
  ReviewFileContentsOutcome,
  ReviewFileDiff,
  ReviewFileDiffOutcome,
  ReviewFileSource,
  ReviewFileStatus,
  ReviewFileSummary,
  ReviewGetFileContentsResult,
  ReviewGetFileDiffsResult,
  ReviewGetFileDiffResult,
  ReviewHunk,
  ReviewLine,
  ReviewMutationResult,
  ReviewSelection,
  ReviewSnapshot,
  ReviewWarning,
  ReviewWordDiff,
} from "@actspace/shared";
import { REVIEW_LOAD_LIMITS } from "@actspace/shared";
import type {
  ResolvedReviewWorkspace,
  ReviewMutationProvider,
  ReviewQueryProvider,
} from "./review-coordinator";
import { reviewSelectionKey } from "./review-view-state-service";

const EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const SUMMARY_OUTPUT_LIMIT = 4 * 1024 * 1024;
const FILE_PATCH_LIMIT = 1024 * 1024;
const FULL_FILE_LIMIT = 2 * 1024 * 1024;
const PATCH_ARGV_BUDGET = 96 * 1024;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);

export type ReviewGitCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  startError?: string;
};

export type ReviewGitCommandRunner = (
  args: string[],
  options: { cwd: string; timeoutMs: number; maxOutputChars: number; input?: string; signal?: AbortSignal },
) => Promise<ReviewGitCommandResult>;

export type ReviewGitEngineOptions = {
  runner?: ReviewGitCommandRunner;
  patchParser?: ReviewPatchParser;
  objectLoader?: ReviewGitObjectLoader;
  trashFile?: (absolutePath: string) => Promise<void>;
  loadLastTurn?: (
    input: ResolvedReviewWorkspace & { selection: Extract<ReviewSelection, { kind: "lastTurn" }>; generation: number },
  ) => Promise<ReviewSnapshot>;
  loadLastTurnFileDiff?: (input: ResolvedReviewWorkspace & {
    snapshot: ReviewSnapshot;
    fileId: string;
    generation: number;
  }) => Promise<ReviewGetFileDiffResult>;
};

export type ReviewPatchParseInput = {
  snapshot: ReviewSnapshot;
  files: ReviewFileSummary[];
  patch: string;
  generation: number;
  truncated: boolean;
};

export type ReviewPatchParser = (input: ReviewPatchParseInput) => Promise<ReviewFileDiffOutcome[]>;

export type ReviewGitObjectRequest = { key: string; spec: string };
export type ReviewGitObjectOutcome = { key: string; side: ReviewFileContentSide };
export type ReviewGitObjectLoader = (input: {
  cwd: string;
  requests: ReviewGitObjectRequest[];
  maxBytes: number;
  signal: AbortSignal;
}) => Promise<ReviewGitObjectOutcome[]>;

type RepositoryContext = ResolvedReviewWorkspace & {
  repoRoot: string;
  pathspec: string;
  hasHead: boolean;
};

type GitSummaryRecord = {
  path: string;
  previousPath?: string;
  status: ReviewFileStatus;
  additions: number;
  deletions: number;
  binary: boolean;
  untracked?: boolean;
};

type SelectionCommand = {
  baseline?: { kind: "git-ref" | "empty-tree"; label: string; ref?: string };
  target?: { label: string; ref?: string };
  numstatArgs: string[];
  nameStatusArgs: string[];
  patchArgs: (path: string, contextLines?: number) => string[];
  patchArgsForPaths: (paths: string[], contextLines?: number) => string[];
  patchAllArgs: string[];
  source: ReviewFileSource;
  comparison?: { from: string; to: string };
  warnings?: ReviewWarning[];
};

type PreparedReviewSnapshot = {
  context: RepositoryContext;
  command: SelectionCommand;
};

type ReviewContentSource =
  | { kind: "unavailable" }
  | { kind: "working"; path: string }
  | { kind: "object"; spec?: string };

export class ReviewGitEngine implements ReviewQueryProvider, ReviewMutationProvider {
  private readonly runner: ReviewGitCommandRunner;
  private readonly patchParser: ReviewPatchParser;
  private readonly objectLoader: ReviewGitObjectLoader;
  private readonly snapshots = new Map<string, ReviewSnapshot>();
  private readonly fileDiffs = new Map<string, ReviewFileDiff[]>();
  private readonly preparedSnapshots = new Map<string, PreparedReviewSnapshot>();

  constructor(private readonly options: ReviewGitEngineOptions = {}) {
    this.runner = options.runner ?? runReviewGitCommand;
    this.patchParser = options.patchParser ?? (async (input) => parseReviewPatchBatch(input));
    this.objectLoader = options.objectLoader ?? (async (input) => Promise.all(input.requests.map(async (request) => {
      const result = await this.runner(["show", request.spec], { cwd: input.cwd, timeoutMs: 10_000, maxOutputChars: input.maxBytes, signal: input.signal });
      return {
        key: request.key,
        side: gitSucceeded(result) && !result.stdout.includes("\0")
          ? { available: true, text: result.stdout, bytes: result.stdout.length, partial: result.truncated }
          : { available: false, bytes: 0, partial: false },
      };
    })));
  }

  async listBranches(workspace: ResolvedReviewWorkspace): Promise<ReviewBranch[]> {
    const repository = await this.resolveRepository(workspace);
    if (repository.ok === false) throw new Error(repository.message);
    const refs = await this.git(repository.context.repoRoot, [
      "for-each-ref",
      "--format=%(refname:short)%00%(upstream:short)%00%(HEAD)",
      "refs/heads",
    ], SUMMARY_OUTPUT_LIMIT);
    if (!gitSucceeded(refs)) throw new Error(sanitizeGitFailure(refs));
    const branches: ReviewBranch[] = [];
    for (const record of refs.stdout.split(/\r?\n/)) {
      if (!record) continue;
      const [branch, upstream, head] = record.split("\0");
      if (!branch || !upstream) continue;
      const divergence = await this.git(repository.context.repoRoot, [
        "rev-list", "--left-right", "--count", `${upstream}...refs/heads/${branch}`,
      ], 64 * 1024);
      const [behind = 0, ahead = 0] = gitSucceeded(divergence)
        ? divergence.stdout.trim().split(/\s+/).map((value) => Number(value) || 0)
        : [0, 0];
      branches.push({ branch, upstream, current: head === "*", ahead, behind });
    }
    return branches.sort((left, right) => Number(right.current) - Number(left.current) || left.branch.localeCompare(right.branch));
  }

  async createPatch(workspace: ResolvedReviewWorkspace, snapshot: ReviewSnapshot): Promise<string> {
    const repository = await this.resolveRepository(workspace);
    if (repository.ok === false) throw new Error(repository.message);
    if (snapshot.selection.kind === "lastTurn") throw new Error("Last Turn cannot be exported as a Git patch.");
    if (snapshot.selection.kind === "uncommitted") {
      const untracked = await this.git(repository.context.repoRoot, [
        "ls-files", "--others", "--exclude-standard", "-z", "--", repository.context.pathspec,
      ], SUMMARY_OUTPUT_LIMIT);
      if (gitSucceeded(untracked) && parseNulFields(untracked.stdout).length > 0) {
        throw new Error("Copy git apply command is unavailable while untracked files are included.");
      }
    }
    const command = await this.selectionCommand(repository.context, snapshot.selection, snapshot.queryOptions.ignoreWhitespaceChanges);
    const patch = await this.git(repository.context.repoRoot, command.patchAllArgs, FILE_PATCH_LIMIT);
    if (!gitSucceeded(patch)) throw new Error(sanitizeGitFailure(patch));
    if (patch.truncated) throw new Error("The patch is too large to export safely.");
    if (!patch.stdout.trim()) throw new Error("There is no patch to apply in this Review scope.");
    return patch.stdout;
  }

  async getSnapshot(input: ResolvedReviewWorkspace & {
    selection: ReviewSelection;
    generation: number;
    options?: ReviewDiffQueryOptions;
    signal?: AbortSignal;
  }): Promise<ReviewSnapshot> {
    const queryOptions = input.options ?? { ignoreWhitespaceChanges: false };
    if (input.selection.kind === "lastTurn") {
      if (this.options.loadLastTurn) return this.options.loadLastTurn({ ...input, selection: input.selection });
      return unavailableSnapshot(input, "Last Turn is unavailable for this session.");
    }

    const repository = await this.resolveRepository(input, input.signal);
    if (repository.ok === false) return unavailableSnapshot(input, repository.message, repository.code === "git_not_found");

    let command: SelectionCommand;
    try {
      command = await this.selectionCommand(repository.context, input.selection, queryOptions.ignoreWhitespaceChanges, input.signal);
    } catch (error) {
      return failedSnapshot(input, repository.context, errorMessage(error));
    }

    const [numstat, nameStatus] = await Promise.all([
      this.git(repository.context.repoRoot, command.numstatArgs, SUMMARY_OUTPUT_LIMIT, undefined, input.signal),
      this.git(repository.context.repoRoot, command.nameStatusArgs, SUMMARY_OUTPUT_LIMIT, undefined, input.signal),
    ]);
    if (!gitSucceeded(numstat) || !gitSucceeded(nameStatus)) {
      return failedSnapshot(input, repository.context, sanitizeGitFailure(!gitSucceeded(numstat) ? numstat : nameStatus));
    }

    const statusRecords = parseNameStatusZ(nameStatus.stdout);
    const statRecords = parseNumstatZ(numstat.stdout);
    const records = mergeSummaryRecords(statusRecords, statRecords);
    const warnings: ReviewWarning[] = [...(command.warnings ?? [])];

    if (input.selection.kind === "uncommitted") {
      const untracked = await this.git(repository.context.repoRoot, [
        "ls-files", "--others", "--exclude-standard", "-z", "--", repository.context.pathspec,
      ], SUMMARY_OUTPUT_LIMIT, undefined, input.signal);
      if (gitSucceeded(untracked)) {
        for (const path of parseNulFields(untracked.stdout)) {
          if (records.some((record) => record.path === path)) continue;
          records.push({ ...(await this.untrackedSummary(repository.context, path, warnings)), untracked: true });
        }
      } else {
        warnings.push({ kind: "provider_failed", message: sanitizeGitFailure(untracked) });
      }
    }

    const source = command.source;
    const files = records
      .map((record) => toFileSummary(record, source, input.selection))
      .sort(compareFiles);
    const additions = files.reduce((total, file) => total + file.additions, 0);
    const deletions = files.reduce((total, file) => total + file.deletions, 0);
    const changedLines = additions + deletions;
    const estimatedChangedBytes = await this.estimateChangedBytes(repository.context, files, command, input.signal);
    const loadPolicy = reviewLoadPolicy(files.length, changedLines, estimatedChangedBytes);
    if (loadPolicy.mode === "single-file") {
      warnings.push({
        kind: "capped",
        message: "This diff is large, showing one file at a time.",
      });
    }
    if (numstat.truncated || nameStatus.truncated) {
      warnings.push({ kind: "truncated", message: "Git summary output was truncated." });
    }

    const snapshot: ReviewSnapshot = {
      id: hashParts(input.workspaceId, reviewSelectionKey(input.selection), String(input.generation)),
      generation: input.generation,
      workspaceId: input.workspaceId,
      workspaceRoot: input.workspaceRoot,
      repoRoot: repository.context.repoRoot,
      selection: { ...input.selection },
      baseline: command.baseline,
      target: command.target,
      comparison: command.comparison,
      status: files.length === 0 ? (warnings.length ? "partial" : "empty") : (warnings.length ? "partial" : "ready"),
      files,
      totals: { files: files.length, additions, deletions, changedLines, estimatedChangedBytes },
      capabilities: capabilitiesFor(input.selection, files, repository.context.hasHead),
      loadPolicy,
      queryOptions,
      generatedAt: new Date().toISOString(),
      ...(warnings.length ? { warnings } : {}),
    };
    this.snapshots.set(snapshot.id, snapshot);
    this.preparedSnapshots.set(snapshot.id, { context: repository.context, command });
    return snapshot;
  }

  async getFileDiff(input: ResolvedReviewWorkspace & {
    snapshot: ReviewSnapshot;
    fileId: string;
    generation: number;
    contextLines?: number;
    loadFullFile?: boolean;
  }): Promise<ReviewGetFileDiffResult> {
    const result = await this.getFileDiffs({
      ...input,
      requests: [{ fileId: input.fileId, contextLines: input.contextLines }],
      signal: new AbortController().signal,
    });
    if (result.ok === false) return result;
    const outcome = result.outcomes[0];
    if (!outcome) return { ok: false, code: "file_not_found", message: "Review file diff is unavailable." };
    if (outcome.status === "failed") return { ok: false, code: outcome.code, message: outcome.message };
    return { ok: true, diff: outcome.diff };
  }

  async getFileDiffs(input: ResolvedReviewWorkspace & {
    snapshot: ReviewSnapshot;
    requests: ReviewDiffRequest[];
    generation: number;
    signal: AbortSignal;
  }): Promise<ReviewGetFileDiffsResult> {
    if (input.snapshot.selection.kind === "lastTurn") {
      if (this.options.loadLastTurnFileDiff) {
        const outcomes = await Promise.all(input.requests.map(async (request): Promise<ReviewFileDiffOutcome> => {
          const result = await this.options.loadLastTurnFileDiff!({ ...input, fileId: request.fileId });
          return result.ok === true
            ? { fileId: request.fileId, status: result.diff.partial ? "partial" : "ready", diff: result.diff }
            : { fileId: request.fileId, status: "failed", code: result.code, message: result.message };
        }));
        return { ok: true, outcomes };
      }
      return { ok: false, code: "unsupported_scope", message: "Last Turn diff is provided by session history." };
    }
    const prepared = this.preparedSnapshots.get(input.snapshot.id);
    if (!prepared) return { ok: false, code: "snapshot_not_found", message: "Prepared Review snapshot is unavailable." };
    if (input.signal.aborted) return { ok: false, code: "cancelled", message: "Review request was cancelled." };

    const requested = input.requests.map((request) => ({
      request: { ...request, contextLines: Math.max(0, Math.min(200, Math.floor(request.contextLines ?? 3))) },
      file: input.snapshot.files.find((candidate) => candidate.id === request.fileId),
    }));
    const outcomes: ReviewFileDiffOutcome[] = [];
    for (const item of requested) {
      if (!item.file) outcomes.push({ fileId: item.request.fileId, status: "failed", code: "file_not_found", message: "Review file is not part of the snapshot." });
    }

    const untracked = requested.filter((item) => item.file?.untracked);
    const tracked = requested.filter((item) => item.file && !item.file.untracked);
    const groups = new Map<number, typeof tracked>();
    for (const item of tracked) {
      const contextLines = item.request.contextLines ?? 3;
      groups.set(contextLines, [...(groups.get(contextLines) ?? []), item]);
    }

    for (const [contextLines, group] of groups) {
      if (input.signal.aborted) return { ok: false, code: "cancelled", message: "Review request was cancelled." };
      for (const files of chunkFilesByArgv(group.map((item) => item.file!))) {
        const maxOutput = Math.min(12 * 1024 * 1024, Math.max(FILE_PATCH_LIMIT, files.length * FILE_PATCH_LIMIT));
        const patch = await this.git(
          prepared.context.repoRoot,
          prepared.command.patchArgsForPaths(files.map((file) => file.path), contextLines),
          maxOutput,
          undefined,
          input.signal,
        );
        if (!gitSucceeded(patch)) {
          outcomes.push(...files.map((file) => ({ fileId: file.id, status: "failed" as const, code: "command_failed" as const, message: sanitizeGitFailure(patch) })));
          continue;
        }
        try {
          const parsed = await this.patchParser({ snapshot: input.snapshot, files, patch: patch.stdout, generation: input.generation, truncated: patch.truncated });
          outcomes.push(...parsed);
          this.rememberDiffOutcomes(parsed);
        } catch (error) {
          outcomes.push(...files.map((file) => ({ fileId: file.id, status: "failed" as const, code: "command_failed" as const, message: errorMessage(error) })));
        }
      }
    }

    const untrackedOutcomes = await mapWithConcurrency(untracked, 8, async (item): Promise<ReviewFileDiffOutcome> => {
      if (input.signal.aborted) return { fileId: item.request.fileId, status: "failed", code: "cancelled", message: "Review request was cancelled." };
      const patch = await this.untrackedPatch(prepared.context, item.file!.path);
      if (!gitSucceeded(patch)) return { fileId: item.file!.id, status: "failed", code: "command_failed", message: sanitizeGitFailure(patch) };
      try {
        const [outcome] = await this.patchParser({ snapshot: input.snapshot, files: [item.file!], patch: patch.stdout, generation: input.generation, truncated: patch.truncated });
        if (!outcome) return { fileId: item.file!.id, status: "failed", code: "command_failed", message: "Review worker omitted the parsed file." };
        this.rememberDiffOutcomes([outcome]);
        return outcome;
      } catch (error) {
        return { fileId: item.file!.id, status: "failed", code: "command_failed", message: errorMessage(error) };
      }
    });
    outcomes.push(...untrackedOutcomes);
    const byId = new Map(outcomes.map((outcome) => [outcome.fileId, outcome]));
    return { ok: true, outcomes: input.requests.map((request) => byId.get(request.fileId) ?? ({ fileId: request.fileId, status: "failed", code: "file_not_found", message: "Review file diff is unavailable." })) };
  }

  async getFileContents(input: ResolvedReviewWorkspace & {
    snapshot: ReviewSnapshot;
    fileIds: string[];
    generation: number;
    signal: AbortSignal;
  }): Promise<ReviewGetFileContentsResult> {
    const prepared = this.preparedSnapshots.get(input.snapshot.id);
    if (!prepared || input.snapshot.selection.kind === "lastTurn") {
      return { ok: false, code: "unsupported_scope", message: "Full file content is unavailable for this Review snapshot." };
    }
    const filesById = new Map(input.snapshot.files.map((file) => [file.id, file]));
    const validFiles = input.fileIds
      .map((fileId) => filesById.get(fileId))
      .filter((file): file is ReviewFileSummary => Boolean(file && !file.binary && file.renderKind === "text"));
    const contentSides = new Map<string, ReviewFileContentSide>();
    const objectRequests: ReviewGitObjectRequest[] = [];
    const workingJobs: Promise<void>[] = [];
    for (const file of validFiles) {
      for (const side of ["baseline", "target"] as const) {
        const key = contentSideKey(file.id, side);
        const source = reviewContentSource(input.snapshot, file, side);
        if (source.kind === "unavailable" || (source.kind === "object" && !source.spec)) {
          contentSides.set(key, { available: false, bytes: 0, partial: false });
        } else if (source.kind === "working") {
          workingJobs.push(this.loadWorkingContent(prepared.context, source.path).then((content) => { contentSides.set(key, content); }));
        } else {
          objectRequests.push({ key, spec: source.spec! });
        }
      }
    }
    await Promise.all(workingJobs);
    try {
      for (let index = 0; index < objectRequests.length; index += 4) {
        if (input.signal.aborted) return { ok: false, code: "cancelled", message: "Review request was cancelled." };
        const loaded = await this.objectLoader({
          cwd: prepared.context.repoRoot,
          requests: objectRequests.slice(index, index + 4),
          maxBytes: FULL_FILE_LIMIT,
          signal: input.signal,
        });
        for (const outcome of loaded) contentSides.set(outcome.key, outcome.side);
      }
    } catch (error) {
      return { ok: false, code: "command_failed", message: errorMessage(error) };
    }
    const outcomes = input.fileIds.map((fileId): ReviewFileContentsOutcome => {
      const file = filesById.get(fileId);
      if (!file) return { fileId, status: "failed", code: "file_not_found", message: "Review file is not part of the snapshot." };
      if (file.binary || file.renderKind !== "text") return { fileId, status: "failed", code: "unsupported_scope", message: "Full text content is unavailable for this file." };
      const baseline = contentSides.get(contentSideKey(fileId, "baseline")) ?? { available: false, bytes: 0, partial: false };
      const target = contentSides.get(contentSideKey(fileId, "target")) ?? { available: false, bytes: 0, partial: false };
      const partial = baseline.partial || target.partial;
      const contents = {
        snapshotId: input.snapshot.id,
        generation: input.generation,
        fileId,
        path: file.path,
        baseline,
        target,
        ...(partial ? { warning: { kind: "truncated" as const, filePath: file.path, message: "Full file content exceeded the Review limit." } } : {}),
      };
      return { fileId, status: partial ? "partial" : "ready", contents };
    });
    return { ok: true, outcomes };
  }

  private rememberDiffOutcomes(outcomes: ReviewFileDiffOutcome[]): void {
    for (const outcome of outcomes) {
      if (outcome.status === "failed") continue;
      const diff = outcome.diff;
      const diffKey = fileDiffKey(diff.snapshotId, diff.fileId);
      const loadedDiffs = this.fileDiffs.get(diffKey) ?? [];
      this.fileDiffs.set(diffKey, [...loadedDiffs.filter((candidate) => candidate.patchFingerprint !== diff.patchFingerprint), diff]);
    }
  }

  private async loadWorkingContent(context: RepositoryContext, path: string): Promise<ReviewFileContentSide> {
    const absolutePath = resolve(context.repoRoot, path);
    if (!isInside(context.workspaceRoot, absolutePath)) return { available: false, bytes: 0, partial: false };
    try {
      const stats = await lstat(absolutePath);
      if (!stats.isFile() || stats.isSymbolicLink()) return { available: false, bytes: 0, partial: false };
      const canonical = await realpath(absolutePath);
      if (!isInside(context.workspaceRoot, canonical)) return { available: false, bytes: 0, partial: false };
      const handle = await open(canonical, "r");
      try {
        const buffer = Buffer.alloc(Math.min(stats.size, FULL_FILE_LIMIT));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        const content = buffer.subarray(0, bytesRead);
        if (content.includes(0)) return { available: false, bytes: stats.size, partial: false };
        return { available: true, text: content.toString("utf8"), bytes: stats.size, partial: stats.size > FULL_FILE_LIMIT };
      } finally {
        await handle.close();
      }
    } catch {
      return { available: false, bytes: 0, partial: false };
    }
  }

  private async estimateChangedBytes(
    context: RepositoryContext,
    files: ReviewFileSummary[],
    command: SelectionCommand,
    signal?: AbortSignal,
  ): Promise<number> {
    const objectSpecs: string[] = [];
    const workingSizes = await mapWithConcurrency(files, 8, async (file) => {
      const path = file.status === "deleted" ? (file.previousPath ?? file.path) : file.path;
      if (file.source === "workingTree" && file.status !== "deleted") {
        const absolutePath = resolve(context.repoRoot, path);
        if (!isInside(context.workspaceRoot, absolutePath)) return 0;
        try {
          const stats = await lstat(absolutePath);
          return stats.isFile() && !stats.isSymbolicLink() ? stats.size : 0;
        } catch {
          return Math.max(0, file.additions + file.deletions) * 80;
        }
      }
      const ref = file.status === "deleted"
        ? command.baseline?.ref
        : file.source === "index" ? undefined : command.target?.ref;
      const spec = file.source === "index" && file.status !== "deleted"
        ? `:${path}`
        : ref ? `${ref}:${path}` : undefined;
      if (spec) objectSpecs.push(spec);
      return spec ? 0 : Math.max(0, file.additions + file.deletions) * 80;
    });
    let objectBytes = 0;
    if (objectSpecs.length > 0 && !signal?.aborted) {
      const result = await this.git(
        context.repoRoot,
        ["cat-file", "--batch-check=%(objectsize)"],
        SUMMARY_OUTPUT_LIMIT,
        `${objectSpecs.join("\n")}\n`,
        signal,
      );
      if (gitSucceeded(result)) {
        objectBytes = result.stdout.split(/\r?\n/).reduce((total, line) => total + (/^\d+$/.test(line) ? Number(line) : 0), 0);
      } else {
        objectBytes = files
          .filter((file) => file.source !== "workingTree" || file.status === "deleted")
          .reduce((total, file) => total + Math.max(0, file.additions + file.deletions) * 80, 0);
      }
    }
    return workingSizes.reduce((total, size) => total + size, 0) + objectBytes;
  }

  async applyMutation(input: ResolvedReviewWorkspace & ReviewApplyMutationInput): Promise<ReviewMutationResult> {
    const snapshot = this.snapshots.get(input.mutation.snapshotId);
    if (!snapshot) return rejected(input.mutation.expectedGeneration, "Review snapshot is not available.");
    const repository = await this.resolveRepository(input);
    if (repository.ok === false) return failed(input.mutation.expectedGeneration, repository.message);
    const files = input.mutation.scope === "section"
      ? snapshot.files
      : snapshot.files.filter((file) => file.path === input.mutation.path);
    if (files.length === 0) return rejected(input.mutation.expectedGeneration, "No matching Review files were found.");

    const completedSteps: ReviewMutationResult["completedSteps"] = [];
    const failedSteps: ReviewMutationResult["failedSteps"] = [];
    for (const file of files) {
      const result = input.mutation.scope === "hunk"
        ? await this.mutateHunk(repository.context, snapshot, file, input)
        : await this.mutateFile(repository.context, file, input);
      completedSteps.push(...result.completedSteps);
      failedSteps.push(...result.failedSteps);
    }
    const status = failedSteps.length === 0 ? "success" : completedSteps.length > 0 ? "partialSuccess" : "failed";
    return { status, generation: input.mutation.expectedGeneration, completedSteps, failedSteps };
  }

  invalidateWorkspace(workspaceId: string): void {
    const snapshotIds = [...this.snapshots.values()]
      .filter((snapshot) => snapshot.workspaceId === workspaceId)
      .map((snapshot) => snapshot.id);
    for (const snapshotId of snapshotIds) {
      this.snapshots.delete(snapshotId);
      this.preparedSnapshots.delete(snapshotId);
      for (const key of this.fileDiffs.keys()) {
        if (key.startsWith(`${snapshotId}:`)) this.fileDiffs.delete(key);
      }
    }
  }

  dispose(): void {
    this.snapshots.clear();
    this.preparedSnapshots.clear();
    this.fileDiffs.clear();
  }

  private async resolveRepository(workspace: ResolvedReviewWorkspace, signal?: AbortSignal): Promise<
    | { ok: true; context: RepositoryContext }
    | { ok: false; code: "git_not_found" | "not_a_repository" | "invalid_workspace"; message: string }
  > {
    let workspaceRoot: string;
    try {
      workspaceRoot = await realpath(resolve(workspace.workspaceRoot));
    } catch {
      return { ok: false, code: "invalid_workspace", message: "Workspace folder is no longer available." };
    }
    const result = await this.git(workspaceRoot, ["rev-parse", "--show-toplevel"], 64 * 1024, undefined, signal);
    if (gitMissing(result)) return { ok: false, code: "git_not_found", message: "Git is not available on this machine." };
    if (!gitSucceeded(result)) return { ok: false, code: "not_a_repository", message: "Current workspace is not a Git repository." };
    const repoRoot = await realpath(resolve(result.stdout.trim()));
    if (!isInside(repoRoot, workspaceRoot)) return { ok: false, code: "invalid_workspace", message: "Workspace is outside the Git repository." };
    const pathspec = relative(repoRoot, workspaceRoot).split(sep).join("/") || ".";
    const head = await this.git(repoRoot, ["rev-parse", "--verify", "HEAD"], 64 * 1024, undefined, signal);
    return { ok: true, context: { ...workspace, workspaceRoot, repoRoot, pathspec, hasHead: gitSucceeded(head) } };
  }

  private async selectionCommand(
    context: RepositoryContext,
    selection: Exclude<ReviewSelection, { kind: "lastTurn" }>,
    ignoreWhitespaceChanges = false,
    signal?: AbortSignal,
  ): Promise<SelectionCommand> {
    const pathspec = context.pathspec;
    const baselineRef = context.hasHead ? "HEAD" : EMPTY_TREE_SHA;
    if (selection.kind === "unstaged") {
      return diffCommand([], { kind: "git-ref", label: "Index" }, { label: "Working tree" }, "workingTree", pathspec, ignoreWhitespaceChanges);
    }
    if (selection.kind === "staged") {
      return diffCommand(["--cached", baselineRef], context.hasHead
        ? { kind: "git-ref", label: "HEAD", ref: "HEAD" }
        : { kind: "empty-tree", label: "Empty tree", ref: EMPTY_TREE_SHA }, { label: "Index" }, "index", pathspec, ignoreWhitespaceChanges);
    }
    if (selection.kind === "uncommitted") {
      return diffCommand([baselineRef], context.hasHead
        ? { kind: "git-ref", label: "HEAD", ref: "HEAD" }
        : { kind: "empty-tree", label: "Empty tree", ref: EMPTY_TREE_SHA }, { label: "Working tree" }, "workingTree", pathspec, ignoreWhitespaceChanges);
    }
    if (selection.kind === "commit") {
      const verified = await this.git(context.repoRoot, ["cat-file", "-e", `${selection.sha}^{commit}`], 64 * 1024, undefined, signal);
      if (!gitSucceeded(verified)) throw new Error("Selected commit is invalid or unavailable.");
      const parents = await this.git(context.repoRoot, ["rev-list", "--parents", "-n", "1", selection.sha], 64 * 1024, undefined, signal);
      if (!gitSucceeded(parents)) throw new Error(sanitizeGitFailure(parents));
      const fields = parents.stdout.trim().split(/\s+/);
      const parent = fields[1] ?? EMPTY_TREE_SHA;
      return diffCommand([parent, selection.sha], fields[1]
        ? { kind: "git-ref", label: parent.slice(0, 8), ref: parent }
        : { kind: "empty-tree", label: "Empty tree", ref: EMPTY_TREE_SHA }, { label: selection.sha.slice(0, 8), ref: selection.sha }, "commit", pathspec, ignoreWhitespaceChanges);
    }
    if (!context.hasHead) throw new Error("Branch review requires HEAD.");
    const localRef = `refs/heads/${selection.branch}`;
    const local = await this.git(context.repoRoot, ["rev-parse", "--verify", `${localRef}^{commit}`], 64 * 1024, undefined, signal);
    if (!gitSucceeded(local)) throw new Error("Selected local branch is invalid or unavailable.");
    const upstreamResult = await this.git(context.repoRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", `${selection.branch}@{upstream}`], 64 * 1024, undefined, signal);
    if (!gitSucceeded(upstreamResult)) throw new Error(`Branch '${selection.branch}' has no upstream remote-tracking branch.`);
    const upstream = upstreamResult.stdout.trim();
    const mergeBase = await this.git(context.repoRoot, ["merge-base", upstream, localRef], 64 * 1024, undefined, signal);
    if (!gitSucceeded(mergeBase)) throw new Error("Unable to determine the branch merge base.");
    const ref = mergeBase.stdout.trim();
    const divergence = await this.git(context.repoRoot, ["rev-list", "--left-right", "--count", `${upstream}...${localRef}`], 64 * 1024, undefined, signal);
    const behind = gitSucceeded(divergence) ? Number(divergence.stdout.trim().split(/\s+/)[0]) || 0 : 0;
    const command = diffCommand([ref, localRef], { kind: "git-ref", label: `merge-base(${upstream})`, ref }, { label: selection.branch, ref: localRef }, "branch", pathspec, ignoreWhitespaceChanges);
    command.comparison = { from: selection.branch, to: upstream };
    if (behind > 0) {
      command.warnings = [{
        kind: "stale",
        message: `${selection.branch} is ${behind} commit${behind === 1 ? "" : "s"} behind ${upstream}. The diff shows local commits that are not on the upstream branch.`,
      }];
    }
    return command;
  }

  private async untrackedSummary(context: RepositoryContext, path: string, warnings: ReviewWarning[]): Promise<GitSummaryRecord> {
    const absolutePath = resolve(context.repoRoot, path);
    if (!isInside(context.workspaceRoot, absolutePath)) {
      warnings.push({ kind: "ignored_path", filePath: path, message: "Ignored an untracked path outside the workspace." });
      return { path, status: "added", additions: 0, deletions: 0, binary: true };
    }
    try {
      const stats = await lstat(absolutePath);
      if (!stats.isFile() || stats.isSymbolicLink()) return { path, status: "added", additions: 0, deletions: 0, binary: true };
      const canonical = await realpath(absolutePath);
      if (!isInside(context.workspaceRoot, canonical)) return { path, status: "added", additions: 0, deletions: 0, binary: true };
      if (stats.size > FULL_FILE_LIMIT) {
        warnings.push({ kind: "truncated", filePath: path, message: "Untracked file is too large to summarize." });
        return { path, status: "added", additions: 0, deletions: 0, binary: true };
      }
      const content = await readFile(canonical);
      if (content.includes(0)) return { path, status: "added", additions: 0, deletions: 0, binary: true };
      return { path, status: "added", additions: countLines(content.toString("utf8")), deletions: 0, binary: false };
    } catch {
      return { path, status: "added", additions: 0, deletions: 0, binary: true };
    }
  }

  private async untrackedPatch(context: RepositoryContext, path: string): Promise<ReviewGitCommandResult> {
    const absolutePath = resolve(context.repoRoot, path);
    if (!isInside(context.workspaceRoot, absolutePath)) return commandFailure("Untracked file is outside the workspace.");
    try {
      const stats = await lstat(absolutePath);
      if (!stats.isFile() || stats.isSymbolicLink() || stats.size > FILE_PATCH_LIMIT) {
        return commandFailure("Untracked file cannot be loaded as text.");
      }
      const canonical = await realpath(absolutePath);
      if (!isInside(context.workspaceRoot, canonical)) return commandFailure("Untracked file resolves outside the workspace.");
      const content = await readFile(canonical);
      if (content.includes(0)) return commandFailure("Binary file cannot be loaded as text.");
      const text = content.toString("utf8");
      const lines = text.split(/\r?\n/);
      if (lines.at(-1) === "") lines.pop();
      const patch = [`@@ -0,0 +1,${lines.length} @@`, ...lines.map((line) => `+${line}`)].join("\n");
      return { stdout: patch, stderr: "", exitCode: 0, timedOut: false, truncated: false };
    } catch (error) {
      return commandFailure(errorMessage(error));
    }
  }

  private async mutateFile(
    context: RepositoryContext,
    file: ReviewFileSummary,
    input: ResolvedReviewWorkspace & ReviewApplyMutationInput,
  ): Promise<Pick<ReviewMutationResult, "completedSteps" | "failedSteps">> {
    const action = input.mutation.action;
    if (action === "stage") return this.runSteps(context, file.path, [["add", "--", file.path]]);
    if (action === "unstage") {
      const args = context.hasHead ? ["restore", "--staged", "--", file.path] : ["rm", "--cached", "--", file.path];
      return this.runSteps(context, file.path, [args]);
    }
    if (input.mutation.source === "index") {
      if (!context.hasHead) return { completedSteps: [], failedSteps: [{ id: `revert:${file.path}`, status: "failed", message: "Staged revert requires HEAD." }] };
      return this.runSteps(context, file.path, [
        ["restore", "--staged", "--source=HEAD", "--", file.path],
        ["restore", "--worktree", "--source=HEAD", "--", file.path],
      ]);
    }
    if (file.status === "added") {
      if (!this.options.trashFile) return { completedSteps: [], failedSteps: [{ id: `trash:${file.path}`, status: "failed", message: "Safe trash is unavailable." }] };
      const absolutePath = resolve(context.repoRoot, file.path);
      if (!isInside(context.workspaceRoot, absolutePath)) return { completedSteps: [], failedSteps: [{ id: `trash:${file.path}`, status: "failed", message: "Path is outside the workspace." }] };
      try {
        await this.options.trashFile(absolutePath);
        return { completedSteps: [{ id: `trash:${file.path}`, status: "completed" }], failedSteps: [] };
      } catch (error) {
        return { completedSteps: [], failedSteps: [{ id: `trash:${file.path}`, status: "failed", message: errorMessage(error) }] };
      }
    }
    return this.runSteps(context, file.path, [["restore", "--worktree", "--", file.path]]);
  }

  private async mutateHunk(
    context: RepositoryContext,
    snapshot: ReviewSnapshot,
    file: ReviewFileSummary,
    input: ResolvedReviewWorkspace & ReviewApplyMutationInput,
  ): Promise<Pick<ReviewMutationResult, "completedSteps" | "failedSteps">> {
    const hunk = this.fileDiffs.get(fileDiffKey(snapshot.id, file.id))
      ?.flatMap((diff) => diff.hunks)
      .find((candidate) => candidate.id === input.mutation.hunkId && candidate.patchFingerprint === input.mutation.patchFingerprint);
    if (!hunk) {
      return { completedSteps: [], failedSteps: [{ id: `hunk:${file.path}`, status: "failed", message: "Hunk patch is stale or unavailable." }] };
    }
    const patch = buildHunkPatch(file, hunk);
    const args = input.mutation.action === "stage"
      ? ["apply", "--cached", "--unidiff-zero", "-"]
      : input.mutation.action === "unstage"
        ? ["apply", "--cached", "--reverse", "--unidiff-zero", "-"]
        : ["apply", "--reverse", "--unidiff-zero", "-"];
    return this.runSteps(context, `hunk:${file.path}`, [args], patch);
  }

  private async runSteps(
    context: RepositoryContext,
    id: string,
    steps: string[][],
    input?: string,
  ): Promise<Pick<ReviewMutationResult, "completedSteps" | "failedSteps">> {
    const completedSteps: ReviewMutationResult["completedSteps"] = [];
    const failedSteps: ReviewMutationResult["failedSteps"] = [];
    for (let index = 0; index < steps.length; index += 1) {
      const result = await this.git(context.repoRoot, steps[index], SUMMARY_OUTPUT_LIMIT, input);
      const stepId = `${id}:${index + 1}`;
      if (gitSucceeded(result)) completedSteps.push({ id: stepId, status: "completed" });
      else {
        failedSteps.push({ id: stepId, status: "failed", message: sanitizeGitFailure(result) });
        break;
      }
    }
    return { completedSteps, failedSteps };
  }

  private git(cwd: string, args: string[], maxOutputChars: number, input?: string, signal?: AbortSignal): Promise<ReviewGitCommandResult> {
    return this.runner(args, { cwd, timeoutMs: 10_000, maxOutputChars, input, signal });
  }
}

function diffCommand(
  refs: string[],
  baseline: SelectionCommand["baseline"],
  target: SelectionCommand["target"],
  source: ReviewFileSource,
  pathspec: string,
  ignoreWhitespaceChanges = false,
): SelectionCommand {
  const common = ["-c", "core.quotePath=false", "diff", "--no-ext-diff", "--find-renames", ...(ignoreWhitespaceChanges ? ["--ignore-all-space"] : []), ...refs];
  return {
    baseline,
    target,
    source,
    numstatArgs: [...common, "--numstat", "-z", "--", pathspec],
    nameStatusArgs: [...common, "--name-status", "-z", "--", pathspec],
    patchArgs: (path, contextLines = 3) => [...common, `--unified=${Math.max(0, Math.floor(contextLines))}`, "--", path],
    patchArgsForPaths: (paths, contextLines = 3) => [...common, `--unified=${Math.max(0, Math.floor(contextLines))}`, "--", ...paths],
    patchAllArgs: [...common, "--binary", "--full-index", "--", pathspec],
  };
}

export function runReviewGitCommand(
  args: string[],
  options: { cwd: string; timeoutMs: number; maxOutputChars: number; input?: string; signal?: AbortSignal },
): Promise<ReviewGitCommandResult> {
  return new Promise((resolveResult) => {
    if (options.signal?.aborted) {
      resolveResult({ stdout: "", stderr: "Review request was cancelled.", exitCode: null, timedOut: false, truncated: false, startError: "cancelled" });
      return;
    }
    const child = execFile("git", ["-C", options.cwd, ...args], {
      cwd: options.cwd,
      timeout: options.timeoutMs,
      maxBuffer: options.maxOutputChars,
      windowsHide: true,
      encoding: "utf8",
    }, (error, stdout, stderr) => {
      const err = error as (NodeJS.ErrnoException & { killed?: boolean }) | null;
      resolveResult({
        stdout: String(stdout ?? "").slice(0, options.maxOutputChars),
        stderr: String(stderr ?? "").slice(0, options.maxOutputChars),
        exitCode: error && typeof err?.code === "number" ? err.code : error ? null : 0,
        timedOut: err?.killed === true,
        truncated: String(stdout ?? "").length >= options.maxOutputChars || Boolean(error && /maxBuffer/.test(error.message)),
        ...(error && typeof err?.code === "string" ? { startError: error.message } : {}),
      });
    });
    const abort = () => child.kill();
    options.signal?.addEventListener("abort", abort, { once: true });
    child.once("close", () => options.signal?.removeEventListener("abort", abort));
    if (options.input !== undefined) child.stdin?.end(options.input);
  });
}

function parseNameStatusZ(output: string): Array<Pick<GitSummaryRecord, "path" | "previousPath" | "status">> {
  const fields = parseNulFields(output);
  const records: Array<Pick<GitSummaryRecord, "path" | "previousPath" | "status">> = [];
  for (let index = 0; index < fields.length;) {
    const rawStatus = fields[index++];
    const tab = rawStatus.indexOf("\t");
    const statusToken = tab >= 0 ? rawStatus.slice(0, tab) : rawStatus;
    const inlinePath = tab >= 0 ? rawStatus.slice(tab + 1) : undefined;
    const code = statusToken[0];
    if (code === "R" || code === "C") {
      const previousPath = inlinePath ?? fields[index++];
      const path = fields[index++];
      if (path) records.push({ path, previousPath, status: code === "R" ? "renamed" : "copied" });
      continue;
    }
    const path = inlinePath ?? fields[index++];
    if (path) records.push({ path, status: statusFromNameCode(code) });
  }
  return records;
}

function parseNumstatZ(output: string): Array<Pick<GitSummaryRecord, "path" | "previousPath" | "additions" | "deletions" | "binary">> {
  const fields = output.split("\0");
  const records: Array<Pick<GitSummaryRecord, "path" | "previousPath" | "additions" | "deletions" | "binary">> = [];
  for (let index = 0; index < fields.length;) {
    const field = fields[index++];
    if (!field) continue;
    const match = /^([^\t]+)\t([^\t]+)\t(.*)$/.exec(field);
    if (!match) continue;
    const additions = match[1] === "-" ? 0 : Number(match[1]);
    const deletions = match[2] === "-" ? 0 : Number(match[2]);
    const binary = match[1] === "-" || match[2] === "-";
    if (match[3]) {
      records.push({ path: match[3], additions, deletions, binary });
      continue;
    }
    const previousPath = fields[index++];
    const path = fields[index++];
    if (path) records.push({ path, previousPath, additions, deletions, binary });
  }
  return records;
}

function mergeSummaryRecords(
  statuses: ReturnType<typeof parseNameStatusZ>,
  stats: ReturnType<typeof parseNumstatZ>,
): GitSummaryRecord[] {
  const statsByPath = new Map(stats.map((record) => [record.path, record]));
  const records: GitSummaryRecord[] = statuses.map((status) => {
    const stat = statsByPath.get(status.path);
    statsByPath.delete(status.path);
    return {
      ...status,
      additions: stat?.additions ?? 0,
      deletions: stat?.deletions ?? 0,
      binary: stat?.binary ?? false,
      previousPath: status.previousPath ?? stat?.previousPath,
    };
  });
  for (const stat of statsByPath.values()) {
    records.push({ ...stat, status: stat.previousPath ? "renamed" : "modified" });
  }
  return records;
}

function toFileSummary(
  record: GitSummaryRecord,
  source: ReviewFileSource,
  selection: ReviewSelection,
): ReviewFileSummary {
  const fingerprint = hashParts(
    reviewSelectionKey(selection),
    record.path,
    record.previousPath ?? "",
    record.status,
    String(record.additions),
    String(record.deletions),
  );
  return {
    id: hashParts(record.path, record.previousPath ?? "", record.status),
    path: record.path,
    previousPath: record.previousPath,
    status: record.status,
    additions: record.additions,
    deletions: record.deletions,
    binary: record.binary,
    renderKind: record.binary ? (isImagePath(record.path) ? "image" : "binary") : "text",
    source,
    untracked: record.untracked,
    diffLoadStatus: "idle",
    viewed: false,
    fingerprint,
  };
}

export function parseReviewPatchHunks(patch: string, fileFingerprint: string): ReviewHunk[] {
  const lines = patch.split(/\r?\n/);
  const hunks: ReviewHunk[] = [];
  let current: { header: string; oldStart: number; oldLines: number; newStart: number; newLines: number; lines: ReviewLine[]; raw: string[] } | undefined;
  let oldLine = 0;
  let newLine = 0;
  const finish = () => {
    if (!current) return;
    const patchFingerprint = hashParts(fileFingerprint, current.raw.join("\n"));
    hunks.push({
      id: hashParts(patchFingerprint, current.header),
      header: current.header,
      oldStart: current.oldStart,
      oldLines: current.oldLines,
      newStart: current.newStart,
      newLines: current.newLines,
      lines: enrichWordDiffs(current.lines),
      patchFingerprint,
    });
  };
  for (const line of lines) {
    const match = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/.exec(line);
    if (match) {
      finish();
      oldLine = Number(match[1]);
      newLine = Number(match[3]);
      current = {
        header: line,
        oldStart: oldLine,
        oldLines: match[2] ? Number(match[2]) : 1,
        newStart: newLine,
        newLines: match[4] ? Number(match[4]) : 1,
        lines: [],
        raw: [line],
      };
      continue;
    }
    if (!current) continue;
    current.raw.push(line);
    if (line === "\\ No newline at end of file") {
      current.lines.push({ id: hashParts(fileFingerprint, String(current.lines.length), line), kind: "noNewline", text: line });
      continue;
    }
    const prefix = line[0];
    if (prefix === "+") {
      current.lines.push({ id: hashParts(fileFingerprint, String(current.lines.length), line), kind: "addition", newLine, text: line.slice(1) });
      newLine += 1;
    } else if (prefix === "-") {
      current.lines.push({ id: hashParts(fileFingerprint, String(current.lines.length), line), kind: "deletion", oldLine, text: line.slice(1) });
      oldLine += 1;
    } else {
      current.lines.push({ id: hashParts(fileFingerprint, String(current.lines.length), line), kind: "context", oldLine, newLine, text: prefix === " " ? line.slice(1) : line });
      oldLine += 1;
      newLine += 1;
    }
  }
  finish();
  return hunks;
}

function enrichWordDiffs(lines: ReviewLine[]): ReviewLine[] {
  const result = lines.map((line) => ({ ...line }));
  for (let index = 0; index < result.length;) {
    if (result[index].kind !== "deletion") { index += 1; continue; }
    const deletions: ReviewLine[] = [];
    while (result[index]?.kind === "deletion") deletions.push(result[index++]);
    const additions: ReviewLine[] = [];
    while (result[index]?.kind === "addition") additions.push(result[index++]);
    for (let pair = 0; pair < Math.min(deletions.length, additions.length); pair += 1) {
      const [oldDiff, newDiff] = inlineWordDiff(deletions[pair].text, additions[pair].text);
      deletions[pair].wordDiffs = oldDiff;
      additions[pair].wordDiffs = newDiff;
    }
  }
  return result;
}

function inlineWordDiff(oldText: string, newText: string): [ReviewWordDiff[], ReviewWordDiff[]] {
  const oldTokens = oldText.split(/(\s+|[^\p{L}\p{N}_]+)/u).filter(Boolean);
  const newTokens = newText.split(/(\s+|[^\p{L}\p{N}_]+)/u).filter(Boolean);
  if (oldTokens.length * newTokens.length > 14_400) return [[{ kind: "deletion", text: oldText }], [{ kind: "addition", text: newText }]];
  const table = Array.from({ length: oldTokens.length + 1 }, () => new Uint16Array(newTokens.length + 1));
  for (let left = oldTokens.length - 1; left >= 0; left -= 1) {
    for (let right = newTokens.length - 1; right >= 0; right -= 1) {
      table[left][right] = oldTokens[left] === newTokens[right]
        ? table[left + 1][right + 1] + 1
        : Math.max(table[left + 1][right], table[left][right + 1]);
    }
  }
  const oldDiff: ReviewWordDiff[] = [];
  const newDiff: ReviewWordDiff[] = [];
  let left = 0;
  let right = 0;
  const push = (target: ReviewWordDiff[], kind: ReviewWordDiff["kind"], text: string) => {
    const last = target[target.length - 1];
    if (last?.kind === kind) last.text += text;
    else target.push({ kind, text });
  };
  while (left < oldTokens.length && right < newTokens.length) {
    if (oldTokens[left] === newTokens[right]) {
      push(oldDiff, "equal", oldTokens[left]);
      push(newDiff, "equal", newTokens[right]);
      left += 1;
      right += 1;
    } else if (table[left + 1][right] >= table[left][right + 1]) {
      push(oldDiff, "deletion", oldTokens[left++]);
    } else {
      push(newDiff, "addition", newTokens[right++]);
    }
  }
  while (left < oldTokens.length) push(oldDiff, "deletion", oldTokens[left++]);
  while (right < newTokens.length) push(newDiff, "addition", newTokens[right++]);
  return [oldDiff, newDiff];
}

function buildHunkPatch(file: ReviewFileSummary, hunk: ReviewHunk): string {
  const oldPath = file.previousPath ?? file.path;
  const body = hunk.lines.map((line) => {
    if (line.kind === "addition") return `+${line.text}`;
    if (line.kind === "deletion") return `-${line.text}`;
    if (line.kind === "noNewline") return line.text;
    return ` ${line.text}`;
  });
  return [
    `diff --git a/${oldPath} b/${file.path}`,
    `--- a/${oldPath}`,
    `+++ b/${file.path}`,
    hunk.header,
    ...body,
    "",
  ].join("\n");
}

function capabilitiesFor(selection: ReviewSelection, files: ReviewFileSummary[], hasHead: boolean): ReviewCapabilities {
  const hasFiles = files.length > 0;
  const unstaged = selection.kind === "unstaged";
  const staged = selection.kind === "staged";
  const uncommitted = selection.kind === "uncommitted";
  return {
    canStageFile: hasFiles && (unstaged || uncommitted),
    canStageHunk: hasFiles && unstaged,
    canUnstageFile: hasFiles && staged,
    canUnstageHunk: hasFiles && staged,
    canRevertFile: hasFiles && (unstaged || staged),
    canRevertHunk: hasFiles && (unstaged || staged),
    canLoadFullFile: hasFiles,
    canOpenFile: hasFiles,
    canCommit: hasFiles && staged,
    canPush: hasHead,
    canCreatePullRequest: hasHead,
    disabledReasons: {
      ...(!staged ? { commit: "Switch to Staged changes before committing." } : {}),
    },
  };
}

export function reviewLoadPolicy(fileCount: number, changedLines: number, changedBytes: number): ReviewSnapshot["loadPolicy"] {
  if (fileCount > REVIEW_LOAD_LIMITS.fileCount) return { mode: "single-file", reason: "file-count" };
  if (changedLines > REVIEW_LOAD_LIMITS.changedLines) return { mode: "single-file", reason: "changed-lines" };
  if (changedBytes > REVIEW_LOAD_LIMITS.changedBytes) return { mode: "single-file", reason: "changed-bytes" };
  return { mode: "all-files" };
}

function reviewContentSource(snapshot: ReviewSnapshot, file: ReviewFileSummary, side: "baseline" | "target"): ReviewContentSource {
  if ((side === "baseline" && file.status === "added") || (side === "target" && file.status === "deleted")) {
    return { kind: "unavailable" };
  }
  const path = side === "baseline" ? (file.previousPath ?? file.path) : file.path;
  const selection = snapshot.selection;
  if (side === "target") {
    if (selection.kind === "staged") return { kind: "object", spec: `:${path}` };
    if (selection.kind === "commit" || selection.kind === "branch") {
      return { kind: "object", spec: snapshot.target?.ref ? `${snapshot.target.ref}:${path}` : undefined };
    }
    return { kind: "working", path };
  }
  if (selection.kind === "unstaged") return { kind: "object", spec: `:${path}` };
  return { kind: "object", spec: snapshot.baseline?.ref ? `${snapshot.baseline.ref}:${path}` : undefined };
}

function contentSideKey(fileId: string, side: "baseline" | "target"): string {
  return `${fileId}:${side}`;
}

export function parseReviewPatchBatch(input: ReviewPatchParseInput): ReviewFileDiffOutcome[] {
  const patches = splitReviewPatchByPath(input.patch);
  return input.files.map((file) => {
    const patch = patches.get(file.path) ?? patches.get(file.previousPath ?? "") ?? (input.files.length === 1 ? input.patch : "");
    const partial = input.truncated || patch.length >= FILE_PATCH_LIMIT;
    const patchFingerprint = hashParts(input.snapshot.id, file.path, patch);
    const diff: ReviewFileDiff = {
      snapshotId: input.snapshot.id,
      generation: input.generation,
      fileId: file.id,
      path: file.path,
      previousPath: file.previousPath,
      hunks: parseReviewPatchHunks(patch, patchFingerprint),
      oldContentAvailable: file.status !== "added",
      newContentAvailable: file.status !== "deleted",
      partial,
      patchFingerprint,
      ...(partial ? { warning: { kind: "truncated", filePath: file.path, message: "File patch exceeded the Review limit." } } : {}),
    };
    return { fileId: file.id, status: partial ? "partial" : "ready", diff };
  });
}

function splitReviewPatchByPath(patch: string): Map<string, string> {
  const result = new Map<string, string>();
  const starts: number[] = [];
  const pattern = /^diff --git /gm;
  for (let match = pattern.exec(patch); match; match = pattern.exec(patch)) starts.push(match.index);
  for (let index = 0; index < starts.length; index += 1) {
    const chunk = patch.slice(starts[index], starts[index + 1] ?? patch.length);
    const oldHeader = /^--- (.+)$/m.exec(chunk)?.[1];
    const newHeader = /^\+\+\+ (.+)$/m.exec(chunk)?.[1];
    const path = patchHeaderPath(newHeader) ?? patchHeaderPath(oldHeader);
    if (path) result.set(path, chunk);
  }
  return result;
}

function patchHeaderPath(header?: string): string | undefined {
  if (!header || header === "/dev/null") return undefined;
  let value = header.replace(/\t$/, "");
  if (value.startsWith("\"") && value.endsWith("\"")) {
    try {
      value = JSON.parse(value) as string;
    } catch {
      value = value.slice(1, -1).replace(/\\([\\\"])/g, "$1").replace(/\\t/g, "\t").replace(/\\n/g, "\n");
    }
  }
  return value.startsWith("a/") || value.startsWith("b/") ? value.slice(2) : value;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function chunkFilesByArgv(files: ReviewFileSummary[]): ReviewFileSummary[][] {
  const chunks: ReviewFileSummary[][] = [];
  let current: ReviewFileSummary[] = [];
  let bytes = 0;
  for (const file of files) {
    const fileBytes = Buffer.byteLength(file.path, "utf8") + 1;
    if (current.length > 0 && bytes + fileBytes > PATCH_ARGV_BUDGET) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(file);
    bytes += fileBytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function unavailableSnapshot(
  input: ResolvedReviewWorkspace & { selection: ReviewSelection; generation: number; options?: ReviewDiffQueryOptions },
  message: string,
  gitMissing = false,
): ReviewSnapshot {
  return {
    id: hashParts(input.workspaceId, reviewSelectionKey(input.selection), String(input.generation)),
    generation: input.generation,
    workspaceId: input.workspaceId,
    workspaceRoot: input.workspaceRoot,
    selection: { ...input.selection },
    status: "notAvailable",
    files: [],
    totals: { files: 0, additions: 0, deletions: 0, changedLines: 0, estimatedChangedBytes: 0 },
    capabilities: capabilitiesFor(input.selection, [], false),
    loadPolicy: { mode: "all-files" },
    queryOptions: input.options ?? { ignoreWhitespaceChanges: false },
    generatedAt: new Date().toISOString(),
    warnings: [{ kind: gitMissing ? "provider_failed" : "unsupported", message }],
  };
}

function failedSnapshot(
  input: ResolvedReviewWorkspace & { selection: ReviewSelection; generation: number; options?: ReviewDiffQueryOptions },
  repository: RepositoryContext,
  message: string,
): ReviewSnapshot {
  return {
    ...unavailableSnapshot(input, message),
    repoRoot: repository.repoRoot,
    status: "failed",
    warnings: [{ kind: "provider_failed", message }],
  };
}

function parseNulFields(output: string): string[] {
  return output.split("\0").filter((field) => field.length > 0);
}

function statusFromNameCode(code: string): ReviewFileStatus {
  if (code === "A") return "added";
  if (code === "D") return "deleted";
  if (code === "T") return "typeChanged";
  return "modified";
}

function compareFiles(left: ReviewFileSummary, right: ReviewFileSummary): number {
  const order: Record<ReviewFileStatus, number> = { added: 0, modified: 1, renamed: 2, copied: 3, typeChanged: 4, deleted: 5 };
  return order[left.status] - order[right.status] || left.path.localeCompare(right.path);
}

function gitSucceeded(result: ReviewGitCommandResult): boolean {
  return !result.startError && !result.timedOut && result.exitCode === 0;
}

function gitMissing(result: ReviewGitCommandResult): boolean {
  return Boolean(result.startError && /ENOENT|not found|spawn git/i.test(result.startError));
}

function sanitizeGitFailure(result: ReviewGitCommandResult): string {
  if (result.timedOut) return "Git command timed out.";
  return (result.stderr || result.startError || result.stdout || "Git command failed.").replace(/\s+/g, " ").trim().slice(0, 2_000);
}

function isInside(root: string, target: string): boolean {
  const path = relative(resolve(root), resolve(target));
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(path).toLowerCase());
}

function countLines(content: string): number {
  if (!content) return 0;
  const lines = content.split(/\r?\n/);
  return lines.at(-1) === "" ? lines.length - 1 : lines.length;
}

function hashParts(...parts: string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part).update("\0");
  return hash.digest("hex");
}

function fileDiffKey(snapshotId: string, fileId: string): string {
  return `${snapshotId}:${fileId}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function commandFailure(message: string): ReviewGitCommandResult {
  return { stdout: "", stderr: message, exitCode: 1, timedOut: false, truncated: false };
}

function rejected(generation: number, message: string): ReviewMutationResult {
  return { status: "rejected", generation, completedSteps: [], failedSteps: [], message };
}

function failed(generation: number, message: string): ReviewMutationResult {
  return { status: "failed", generation, completedSteps: [], failedSteps: [], message };
}

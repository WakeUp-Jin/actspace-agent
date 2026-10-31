import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { PinnedHarness } from "@actspace/runtime";
import type { RuntimeV2LiveEvent, RuntimeV2RunTurnResponse, SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";
import { writeArtifacts } from "../artifacts";
import { CliError, CliUsageError } from "../errors";
import { bootCliV2 } from "./host-adapter";
import { resolveRuntimeV2DataRoot } from "./data-root";
import type { RuntimeV2CliArtifactResult, RuntimeV2RunCommandControl, RuntimeV2RunCommandOptions } from "./types";

export type RunV2Io = {
  readonly interruptionExitCode?: () => 130 | 143 | undefined;
  readonly onForceCleanup?: (cleanup: () => void) => void;
  readonly stdinIsTTY?: boolean; readonly readStdin?: () => Promise<string>; readonly isInterrupted?: () => boolean;
  readonly onDiagnostic?: (code: string, message: string) => void; readonly onLiveEvent?: (event: RuntimeV2LiveEvent) => void; readonly env?: NodeJS.ProcessEnv; readonly cwd?: () => string; readonly now?: () => Date;
  readonly onControl?: (control: RuntimeV2RunCommandControl) => void;
};

export async function runV2Command(options: RuntimeV2RunCommandOptions, io: RunV2Io = {}): Promise<RuntimeV2CliArtifactResult> {
  const workspace = await resolveWorkspace(options.workspace, io.cwd?.() ?? process.cwd()); const input = await resolveInput(options, io); const persistent = options.persist === true || options.resume !== undefined;
  const dataRoot = resolveRuntimeV2DataRoot(options.dataDir, io.env); const startedAt = (io.now?.() ?? new Date()).toISOString();
  const pinnedHarness = options.harness === undefined ? undefined : await readPinnedHarness(options.harness, dataRoot);
  let liveSeq = 0; let runtimeInstanceId = "booting"; let throughJournalSeq = -1;
  let activeSessionId: string | undefined;
  let activeAbort: (() => boolean) | undefined;
  const booted = await bootCliV2({ onForceCleanup: io.onForceCleanup, kind: "cli-run", workspace, dataRoot, persistentArtifacts: persistent, permissionMode: options.permissionMode, permissionModeExplicit: options.permissionModeExplicit, sandboxInherited: options.sandboxInherited, pinnedHarness, mock: options.mock, model: options.model, headlessInput: input, headlessSessionId: options.resume, env: io.env, onHeadlessSession: (sessionId, abort) => { activeSessionId = sessionId; activeAbort = abort; io.onControl?.({ sessionId, agentRunId: sessionId, abort }); }, onLiveEvent: (event) => io.onLiveEvent?.({ ...event, schemaVersion: 1, runtimeInstanceId, liveSeq: liveSeq++, throughJournalSeq }) }).catch((error: unknown) => {
    // Cordis startup wraps plugin failures; a pinned selection that cannot run keeps its own code.
    for (let cause = error; cause instanceof Error; cause = cause.cause)
      if ((cause as { code?: unknown }).code === "HARNESS_SELECTION_INVALID") throw new CliError(cause.message, "HARNESS_SELECTION_INVALID", 3);
    throw error;
  });
  runtimeInstanceId = booted.profile.getState().runtimeInstanceId;
  try {
    if (io.isInterrupted?.()) activeAbort?.();
    try {
      const runner = booted.profile.context.get?.("headless.runner") as { readonly run: () => Promise<RuntimeV2RunTurnResponse & { readonly session: unknown }> } | undefined;
      if (runner === undefined) throw new Error("Headless runner is not enabled for the selected Profile.");
      const result = await runner.run(); activeSessionId = result.sessionId; throughJournalSeq = result.snapshot.throughJournalSeq;
      const approval = booted.approval.approvalRequired;
      const sessions = booted.profile.context.get?.("session.runtime") as { inspectEvents: (sessionId: string) => Promise<readonly SessionEventEnvelopeV1[]> } | undefined;
      const durableEvents = result.outcome === "failed" || options.out ? await sessions?.inspectEvents(result.sessionId) : undefined;
      const failure = result.outcome === "failed" ? failedRunDiagnostic(durableEvents ?? [], result.taskId) : undefined;
      const harness = pinnedHarness ? mountedHarness(booted.profile.context) : undefined;
      const output = projectCliArtifactResult(result, { failure, workspace, startedAt, endedAt: (io.now?.() ?? new Date()).toISOString(), persistent, interrupted: io.isInterrupted?.() ?? false, interruptionExitCode: io.interruptionExitCode?.(), approvalName: approval?.toolName, harness });
      if (output.error) io.onDiagnostic?.(output.error.code, output.error.message);
      if (options.out) {
        if (durableEvents === undefined) throw new Error("Session service is not available for the selected Profile.");
        await writeArtifacts({ outDir: options.out, result: output, events: durableEvents, finalText: output.finalText });
        const artifacts = result.snapshot.tools.flatMap((tool) => tool.artifacts.map((artifact) => ({ artifactId: artifact.artifactId, mediaType: artifact.mimeType })));
        await booted.artifacts.exportForSession(result.sessionId, artifacts, resolve(options.out));
      }
      return output;
    } catch (error) {
      if (!(io.isInterrupted?.() ?? false)) throw error;
      return { schemaVersion: 1, ok: false, status: "aborted", exitCode: io.interruptionExitCode?.() ?? 130, sessionId: activeSessionId ?? options.resume ?? "unknown", agentRunId: activeSessionId ?? options.resume ?? "unknown", finalText: "", messageCount: 0, eventCount: 0, permissionMode: options.permissionMode, workspace, startedAt, endedAt: (io.now?.() ?? new Date()).toISOString(), persistent, error: { code: "ABORTED", message: error instanceof Error ? error.message : String(error) } };
    }
  } finally {
    await booted.profile.shutdown().catch((error) => io.onDiagnostic?.("SHUTDOWN_INCOMPLETE", error instanceof Error ? error.message : String(error)));
  }
}

export function projectCliArtifactResult(result: RuntimeV2RunTurnResponse, context: {
  readonly workspace: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly persistent: boolean;
  readonly interrupted: boolean;
  readonly interruptionExitCode?: 130 | 143;
  readonly approvalName?: string;
  readonly failure?: { readonly code: string; readonly message: string };
  readonly harness?: RuntimeV2CliArtifactResult["harness"];
}): RuntimeV2CliArtifactResult {
  const exitCode = context.interrupted ? context.interruptionExitCode ?? 130 : context.approvalName !== undefined ? 4 : result.outcome === "completed" ? 0 : result.outcome === "cancelled" ? 130 : 1;
  return Object.freeze({
    schemaVersion: 1,
    ok: exitCode === 0,
    status: context.interrupted ? "aborted" : context.approvalName !== undefined ? "approval_required" : result.outcome === "completed" ? "completed" : result.outcome === "cancelled" ? "aborted" : "failed",
    exitCode,
    sessionId: result.sessionId,
    agentRunId: result.agentRunId ?? result.taskId,
    taskId: result.taskId,
    outcome: result.outcome,
    value: result.value,
    finalText: result.value && typeof result.value === "object" && !Array.isArray(result.value) && "finalText" in result.value && typeof result.value.finalText === "string" ? result.value.finalText : "",
    snapshot: result.snapshot,
    totalUsage: result.snapshot.usage,
    messageCount: result.snapshot.messages.length,
    eventCount: result.snapshot.throughJournalSeq + 1,
    permissionMode: result.snapshot.permissionMode,
    workspace: context.workspace,
    startedAt: context.startedAt,
    endedAt: context.endedAt,
    persistent: context.persistent,
    ...(context.harness ? { harness: context.harness } : {}),
    ...(context.approvalName === undefined ? (context.failure ? { error: context.failure } : {}) : { error: { code: "APPROVAL_REQUIRED", message: `${context.approvalName} requires interactive approval.` } }),
  });
}

/**
 * The selection file is a Harness `SelectionDescription`, optionally with the expected `executionDigest`. The data root
 * must not hold selection history, so the pinned selection can never mix with (or be replaced by) a persisted one.
 */
async function readPinnedHarness(path: string, dataRoot: string): Promise<PinnedHarness> {
  const invalid = (message: string) => new CliError(`${message}: ${resolve(path)}`, "HARNESS_SELECTION_INVALID", 3);
  let parsed: unknown;
  try { parsed = JSON.parse(await readFile(resolve(path), "utf8")); }
  catch (error) { throw invalid(`Cannot read Harness selection (${error instanceof Error ? error.message : String(error)})`); }
  const value = record(parsed);
  const strings = (list: unknown) => Array.isArray(list) && list.every(item => typeof item === "string");
  if (typeof value.hostContractDigest !== "string" || !strings(value.artifactIds) || !strings(value.sharedServices) || typeof value.composition !== "object" || value.composition === null
    || (value.executionDigest !== undefined && typeof value.executionDigest !== "string")) throw invalid("Harness selection must hold hostContractDigest, composition, artifactIds and sharedServices");
  try { await stat(join(dataRoot, "harness-state", "selections.jsonl")); throw new CliUsageError(`--harness needs a data directory without Harness selection history: ${dataRoot}`, "HARNESS_STATE_EXISTS"); }
  catch (error) { if (error instanceof CliUsageError) throw error; }
  const { executionDigest, ...description } = value;
  return { description: description as unknown as PinnedHarness["description"], ...(typeof executionDigest === "string" ? { executionDigest } : {}) };
}
function mountedHarness(context: { readonly get?: (id: string) => unknown }): RuntimeV2CliArtifactResult["harness"] {
  const control = context.get?.("harness.control") as { inspect: (id: string) => { current?: { harnessId: string; revision: number; executionDigest: string } } } | undefined;
  const current = control?.inspect("main").current;
  return current ? { harnessId: current.harnessId, revision: current.revision, executionDigest: current.executionDigest } : undefined;
}

async function resolveInput(options: RuntimeV2RunCommandOptions, io: RunV2Io): Promise<string> { if (options.input && options.inputFile) throw new CliUsageError("Use only one of --input, --input-file, or stdin"); if (options.input !== undefined) return requireInput(options.input); if (options.inputFile) { const { readFile } = await import("node:fs/promises"); return requireInput(await readFile(resolve(options.inputFile), "utf8")); } if (io.stdinIsTTY === false && io.readStdin) return requireInput(await io.readStdin()); throw new CliUsageError("Missing input: use --input, --input-file, or non-TTY stdin"); }
function requireInput(value: string): string { if (!value.trim()) throw new CliUsageError("Agent input must not be empty"); return value; }
async function resolveWorkspace(value: string | undefined, cwd: string): Promise<string> { const workspace = resolve(value ?? cwd); try { if (!(await stat(workspace)).isDirectory()) throw new Error("not a directory"); } catch { throw new CliUsageError(`Workspace is not an accessible directory: ${workspace}`, "INVALID_WORKSPACE"); } return workspace; }

// A failed custom Loop need not produce built-in turn events. Keep its value
// untouched, and only use a built-in failure within this Task's Run boundary.
function failedRunDiagnostic(events: readonly SessionEventEnvelopeV1[], taskId: string): { code: string; message: string } {
  const start = events.findIndex(event => event.type === "plugin/actspace.agent-service/run" && record(event.data).op === "start" && record(event.data).taskId === taskId);
  if (start >= 0) for (const event of events.slice(start + 1)) {
    if (event.type === "plugin/actspace.agent-service/run") break;
    const data = record(event.data);
    if (event.type === "turn/end" && data.reason === "failed") {
      const failure = record(data.failure);
      if (typeof failure.message === "string") return { code: typeof failure.kind === "string" ? failure.kind : "RUN_FAILED", message: failure.message };
    }
  }
  return { code: "RUN_FAILED", message: "Agent task failed. Inspect the Session journal for details." };
}
function record(value: unknown): Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

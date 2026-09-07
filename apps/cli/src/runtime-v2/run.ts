import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { RuntimeV2LiveEvent, RuntimeV2RunTurnResponse } from "@actspace/shared/runtime-v2";
import { writeArtifacts } from "../artifacts";
import { CliUsageError } from "../errors";
import { bootCliV2 } from "./host-adapter";
import { resolveRuntimeV2DataRoot } from "./data-root";
import type { RuntimeV2CliArtifactResult, RuntimeV2RunCommandControl, RuntimeV2RunCommandOptions } from "./types";

export type RunV2Io = {
  readonly stdinIsTTY?: boolean; readonly readStdin?: () => Promise<string>; readonly isInterrupted?: () => boolean;
  readonly onDiagnostic?: (code: string, message: string) => void; readonly onLiveEvent?: (event: RuntimeV2LiveEvent) => void; readonly env?: NodeJS.ProcessEnv; readonly cwd?: () => string; readonly now?: () => Date;
  readonly onControl?: (control: RuntimeV2RunCommandControl) => void;
};

export async function runV2Command(options: RuntimeV2RunCommandOptions, io: RunV2Io = {}): Promise<RuntimeV2CliArtifactResult> {
  const workspace = await resolveWorkspace(options.workspace, io.cwd?.() ?? process.cwd()); const input = await resolveInput(options, io); const persistent = options.persist === true || options.resume !== undefined;
  const dataRoot = resolveRuntimeV2DataRoot(options.dataDir, io.env); const startedAt = (io.now?.() ?? new Date()).toISOString();
  let liveSeq = 0; let runtimeInstanceId = "booting"; let throughJournalSeq = -1;
  let activeSessionId: string | undefined;
  let activeAbort: (() => boolean) | undefined;
  const booted = await bootCliV2({ kind: "cli-run", workspace, dataRoot, persistentArtifacts: persistent, permissionMode: options.permissionMode, mock: options.mock, model: options.model, headlessInput: input, headlessSessionId: options.resume, env: io.env, onHeadlessSession: (sessionId, abort) => { activeSessionId = sessionId; activeAbort = abort; io.onControl?.({ sessionId, agentRunId: sessionId, abort }); }, onLiveEvent: (event) => io.onLiveEvent?.({ ...event, schemaVersion: 1, runtimeInstanceId, liveSeq: liveSeq++, throughJournalSeq }) });
  runtimeInstanceId = booted.profile.getState().runtimeInstanceId;
  try {
    if (io.isInterrupted?.()) activeAbort?.();
    try {
      const runner = booted.profile.context.get?.("headless.runner") as { readonly run: () => Promise<RuntimeV2RunTurnResponse & { readonly session: unknown }> } | undefined;
      if (runner === undefined) throw new Error("Headless runner is not enabled for the selected Profile.");
      const result = await runner.run(); activeSessionId = result.sessionId; throughJournalSeq = result.snapshot.throughJournalSeq;
      const approval = booted.approval.approvalRequired;
      const output = projectCliArtifactResult(result, { permissionMode: options.permissionMode, workspace, startedAt, endedAt: (io.now?.() ?? new Date()).toISOString(), persistent, interrupted: io.isInterrupted?.() ?? false, approvalName: approval?.name });
      if (options.out) {
        const sessions = booted.profile.context.get?.("session.runtime") as { inspectEvents: (sessionId: string) => Promise<readonly unknown[]> } | undefined;
        if (sessions === undefined) throw new Error("Session service is not available for the selected Profile.");
        const durableEvents = await sessions.inspectEvents(result.sessionId);
        await writeArtifacts({ outDir: options.out, result: output, events: durableEvents, finalText: output.finalText });
        const artifacts = result.snapshot.tools.flatMap((tool) => tool.artifacts.map((artifact) => ({ artifactId: artifact.artifactId, mediaType: artifact.mimeType })));
        await booted.artifacts.exportForSession(result.sessionId, artifacts, resolve(options.out));
      }
      return output;
    } catch (error) {
      if (!(io.isInterrupted?.() ?? false)) throw error;
      return { schemaVersion: 1, ok: false, status: "aborted", exitCode: 130, sessionId: activeSessionId ?? options.resume ?? "unknown", agentRunId: activeSessionId ?? options.resume ?? "unknown", finalText: "", messageCount: 0, eventCount: 0, permissionMode: options.permissionMode, workspace, startedAt, endedAt: (io.now?.() ?? new Date()).toISOString(), persistent, error: { code: "ABORTED", message: error instanceof Error ? error.message : String(error) } };
    }
  } finally {
    await booted.profile.shutdown().catch((error) => io.onDiagnostic?.("SHUTDOWN_INCOMPLETE", error instanceof Error ? error.message : String(error)));
  }
}

export function projectCliArtifactResult(result: RuntimeV2RunTurnResponse, context: {
  readonly permissionMode: RuntimeV2RunCommandOptions["permissionMode"];
  readonly workspace: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly persistent: boolean;
  readonly interrupted: boolean;
  readonly approvalName?: string;
}): RuntimeV2CliArtifactResult {
  const exitCode = context.approvalName !== undefined ? 4 : result.reason === "completed" ? 0 : context.interrupted || result.reason === "aborted" ? 130 : 1;
  return Object.freeze({
    schemaVersion: 1,
    ok: exitCode === 0,
    status: context.approvalName !== undefined ? "approval_required" : result.reason === "completed" ? "completed" : result.reason === "aborted" ? "aborted" : "failed",
    exitCode,
    sessionId: result.sessionId,
    agentRunId: result.agentRunId,
    turnId: result.turnId,
    reason: result.reason,
    steps: result.steps,
    finalText: result.finalText,
    snapshot: result.snapshot,
    totalUsage: result.snapshot.usage,
    messageCount: result.snapshot.messages.length,
    eventCount: result.snapshot.throughJournalSeq + 1,
    permissionMode: context.permissionMode,
    workspace: context.workspace,
    startedAt: context.startedAt,
    endedAt: context.endedAt,
    persistent: context.persistent,
    ...(context.approvalName === undefined ? {} : { error: { code: "APPROVAL_REQUIRED", message: `${context.approvalName} requires interactive approval.` } }),
  });
}

async function resolveInput(options: RuntimeV2RunCommandOptions, io: RunV2Io): Promise<string> { if (options.input && options.inputFile) throw new CliUsageError("Use only one of --input, --input-file, or stdin"); if (options.input !== undefined) return requireInput(options.input); if (options.inputFile) { const { readFile } = await import("node:fs/promises"); return requireInput(await readFile(resolve(options.inputFile), "utf8")); } if (io.stdinIsTTY === false && io.readStdin) return requireInput(await io.readStdin()); throw new CliUsageError("Missing input: use --input, --input-file, or non-TTY stdin"); }
function requireInput(value: string): string { if (!value.trim()) throw new CliUsageError("Agent input must not be empty"); return value; }
async function resolveWorkspace(value: string | undefined, cwd: string): Promise<string> { const workspace = resolve(value ?? cwd); try { if (!(await stat(workspace)).isDirectory()) throw new Error("not a directory"); } catch { throw new CliUsageError(`Workspace is not an accessible directory: ${workspace}`, "INVALID_WORKSPACE"); } return workspace; }

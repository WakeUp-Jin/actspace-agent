import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { RuntimeStreamEvent } from "@actspace/shared";
import { writeArtifacts } from "./artifacts";
import { ContextSnapshotCollector } from "./context-snapshot-collector";
import { CliUsageError } from "./errors";
import { CliTraceCollector } from "./event-collector";
import { createCliAgentRuntime, resolveCliDataDir } from "./runtime-adapter";
import type { CliArtifactResult, RunCommandOptions } from "./types";

export type RunCommandControl = {
  sessionId: string;
  turnId: string;
  abort: () => boolean;
};

export type RunCommandIo = {
  stdinIsTTY?: boolean;
  readStdin?: () => Promise<string>;
  onRuntimeEvent?: (event: RuntimeStreamEvent) => void | Promise<void>;
  onControl?: (control: RunCommandControl) => void;
  isInterrupted?: () => boolean;
  onDiagnostic?: (code: string, message: string, error?: unknown) => void;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  cwd?: () => string;
};

export async function runCommand(
  options: RunCommandOptions,
  io: RunCommandIo = {},
): Promise<CliArtifactResult> {
  const workspace = await resolveWorkspace(options.workspace, io.cwd?.() ?? process.cwd());
  const input = await resolveInput(options, io);
  const dataDir = resolveCliDataDir(options.dataDir, io.env);
  const startedAt = (io.now?.() ?? new Date()).toISOString();
  const id = randomUUID();
  const sessionId = `run-${id}`;
  const turnId = `turn-${id}`;
  const collector = new CliTraceCollector();
  const contextSnapshots = options.out ? new ContextSnapshotCollector() : undefined;
  const { runtime, headlessApprovalBroker } = createCliAgentRuntime({
    workspace,
    dataDir,
    permissionMode: options.permissionMode,
    mock: options.mock,
    model: options.model,
    contextSnapshots,
    eventSink: async (event) => {
      collector.captureRuntime(event);
      await io.onRuntimeEvent?.(event);
    },
    onDiagnostic: (diagnostic) => io.onDiagnostic?.(
      diagnostic.code,
      diagnostic.message,
      diagnostic.error,
    ),
  });

  io.onControl?.({
    sessionId,
    turnId,
    abort: () => runtime.abortTurn({ sessionId, turnId }),
  });

  try {
    const runtimeResultPromise = runtime.runTurn({
      sessionId,
      turnId,
      userInput: input,
      workspaceRoot: workspace,
      roots: {
        dataRoot: dataDir,
        sessionRoot: join(dataDir, "sessions"),
        tmpRoot: tmpdir(),
        defaultWorkspaceRoot: workspace,
      },
      persistenceMode: "ephemeral",
      interactionMode: "cli-headless",
      mode: "agent",
    });
    if (io.isInterrupted?.()) runtime.abortTurn({ sessionId, turnId });
    const runtimeResult = await runtimeResultPromise;
    collector.captureHarness(runtimeResult.events);

    const approval = headlessApprovalBroker?.approvalRequired;
    const interrupted = io.isInterrupted?.() ?? false;
    const status = approval
      ? "approval_required"
      : runtimeResult.status;
    const exitCode = approval
      ? 4
      : runtimeResult.status === "completed" ? 0
        : interrupted && runtimeResult.status === "aborted" ? 130 : 1;
    const finalReply = runtimeResult.finalReply;
    const result: CliArtifactResult = {
      schemaVersion: 1,
      ok: exitCode === 0,
      status,
      exitCode,
      sessionId,
      turnId,
      finalText: finalReply?.content ?? "",
      model: finalReply?.model,
      provider: finalReply?.provider,
      stopReason: finalReply?.stopReason,
      totalUsage: finalReply?.usage,
      messageCount: runtimeResult.events.filter((event) => (
        event.type === "user_message"
        || event.type === "assistant_message"
        || event.type === "assistant_reply"
      )).length,
      eventCount: collector.getEvents().length,
      permissionMode: options.permissionMode,
      workspace,
      startedAt,
      endedAt: (io.now?.() ?? new Date()).toISOString(),
      ...(approval ? {
        error: {
          code: "APPROVAL_REQUIRED",
          message: `${approval.toolName} requires interactive approval; use chat or an automatic policy.`,
        },
      } : runtimeResult.error ? { error: runtimeResult.error } : {}),
    };

    if (options.out) {
      await writeArtifacts({
        outDir: options.out,
        result,
        events: collector.getEvents(),
        finalText: result.finalText,
        contextSnapshots: contextSnapshots?.getSnapshots(),
      });
    }
    return result;
  } finally {
    await runtime.dispose();
  }
}

async function resolveInput(options: RunCommandOptions, io: RunCommandIo): Promise<string> {
  if (options.input && options.inputFile) {
    throw new CliUsageError("Use only one of --input, --input-file, or stdin");
  }

  const canReadStdin = io.stdinIsTTY === false && io.readStdin;
  if (options.input || options.inputFile) {
    if (options.input !== undefined) return requireNonEmptyInput(options.input);
    try {
      return requireNonEmptyInput(await readFile(resolve(options.inputFile!), "utf8"));
    } catch (error) {
      if (error instanceof CliUsageError) throw error;
      throw new CliUsageError(`Cannot read --input-file: ${formatError(error)}`, "INPUT_FILE_ERROR");
    }
  }

  if (!canReadStdin) {
    throw new CliUsageError("Missing input: use --input, --input-file, or non-TTY stdin");
  }
  return requireNonEmptyInput(await io.readStdin!());
}

function requireNonEmptyInput(input: string): string {
  if (!input.trim()) throw new CliUsageError("Agent input must not be empty");
  return input;
}

async function resolveWorkspace(workspace: string | undefined, cwd: string): Promise<string> {
  const absolute = resolve(workspace ?? cwd);
  try {
    if (!(await stat(absolute)).isDirectory()) {
      throw new CliUsageError(`Workspace is not a directory: ${absolute}`, "INVALID_WORKSPACE");
    }
  } catch (error) {
    if (error instanceof CliUsageError) throw error;
    throw new CliUsageError(`Workspace is not accessible: ${absolute}`, "INVALID_WORKSPACE");
  }
  return absolute;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

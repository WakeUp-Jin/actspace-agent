import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  createSessionRecord,
  createSessionStorePaths,
  listSessionRecords,
  readMeta,
} from "@actspace/agent-core";
import type { SessionListItem } from "@actspace/shared";
import { acquireSessionLock, assertSafeSessionId, type SessionLock } from "./chat-session";
import { CliUsageError } from "./errors";
import { createCliAgentRuntime, resolveCliDataDir } from "./runtime-adapter";
import { TerminalApprovalBroker } from "./terminal-approval";
import type { TerminalLineInput } from "./terminal-input";
import { TerminalRenderer, shouldUseColor } from "./terminal-renderer";
import type { ChatCommandOptions, CliExitCode } from "./types";

export type ChatCommandIo = {
  input: TerminalLineInput;
  write: (text: string) => void;
  writeStatus?: (text: string) => void;
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
  env?: NodeJS.ProcessEnv;
  cwd?: () => string;
};

export async function chatCommand(
  options: ChatCommandOptions,
  io: ChatCommandIo,
): Promise<CliExitCode> {
  if (!io.stdinIsTTY || !io.stdoutIsTTY) {
    throw new CliUsageError("chat requires TTY stdin and stdout; use run for pipes or automation", "TTY_REQUIRED");
  }
  const workspace = await resolveWorkspace(options.workspace, io.cwd?.() ?? process.cwd());
  const dataDir = resolveCliDataDir(options.dataDir, io.env);
  const sessionRoot = join(dataDir, "sessions");
  const renderer = new TerminalRenderer({
    write: io.write,
    writeStatus: io.writeStatus,
    color: shouldUseColor({ isTTY: io.stdoutIsTTY, env: io.env }),
  });
  const approvalBroker = new TerminalApprovalBroker(
    options.permissionMode,
    workspace,
    io.input,
    io.writeStatus ?? io.write,
  );
  const { runtime } = createCliAgentRuntime({
    workspace,
    dataDir,
    permissionMode: options.permissionMode,
    mock: options.mock,
    model: options.model,
    approvalBroker,
    eventSink: (event) => renderer.render(event),
    onDiagnostic: (diagnostic) => renderer.note(`${diagnostic.code}: ${diagnostic.message}`),
  });

  let current = await createLockedSession(sessionRoot, workspace);
  let activeAgentRun: { sessionId: string; agentRunId: string } | undefined;
  let exitRequested = false;
  const removeSigint = io.input.onSigint(() => {
    if (activeAgentRun) {
      runtime.abortAgentRun(activeAgentRun);
      approvalBroker.abortAgentRun(activeAgentRun.sessionId, activeAgentRun.agentRunId);
      io.input.cancelCurrent();
      return;
    }
    exitRequested = true;
    io.input.cancelCurrent();
  });

  renderer.note(`session ${current.sessionId}`);
  try {
    while (!exitRequested) {
      const line = await io.input.readLine(`actspace(${shortId(current.sessionId)})> `);
      if (line === null || exitRequested) break;
      const input = line.trim();
      if (!input) continue;
      if (input === "/exit") break;
      if (input === "/new") {
        const next = await createLockedSession(sessionRoot, workspace);
        await current.lock.release();
        current = next;
        renderer.note(`session ${current.sessionId}`);
        continue;
      }
      if (input === "/sessions") {
        renderSessions(await listSessionRecords(sessionRoot), io.writeStatus ?? io.write);
        continue;
      }
      if (input.startsWith("/resume")) {
        const sessionId = input.slice("/resume".length).trim();
        if (!sessionId) {
          renderer.note("usage: /resume <session-id>");
          continue;
        }
        if (sessionId === current.sessionId) continue;
        const next = await resumeLockedSession(sessionRoot, sessionId, workspace);
        await current.lock.release();
        current = next;
        renderer.note(`session ${current.sessionId}`);
        continue;
      }
      if (input.startsWith("/")) {
        renderer.note(`unknown command: ${input.split(/\s/, 1)[0]}`);
        continue;
      }

      const agentRunId = `run-${randomUUID()}`;
      activeAgentRun = { sessionId: current.sessionId, agentRunId };
      renderer.beginAgentRun();
      const result = await runtime.runAgentRun({
        sessionId: current.sessionId,
        agentRunId,
        userInput: line,
        workspaceRoot: workspace,
        roots: {
          dataRoot: dataDir,
          sessionRoot,
          logRoot: join(dataDir, "logs"),
          tmpRoot: join(dataDir, "runtime", "tmp"),
          defaultWorkspaceRoot: workspace,
        },
        persistenceMode: "persistent",
        interactionMode: "cli-interactive",
        mode: "agent",
      });
      if (!renderer.hasAssistantText() && result.finalReply?.content) {
        io.write(`${result.finalReply.content}\n`);
      }
      activeAgentRun = undefined;
    }
    return 0;
  } finally {
    activeAgentRun = undefined;
    removeSigint();
    await runtime.dispose();
    await current.lock.release();
    io.input.close();
  }
}

async function createLockedSession(sessionRoot: string, workspace: string) {
  const record = await createSessionRecord(sessionRoot, { workspaceRoot: workspace });
  const lock = await acquireSessionLock(sessionRoot, record.meta.id);
  return { sessionId: record.meta.id, lock };
}

async function resumeLockedSession(sessionRoot: string, sessionId: string, workspace: string) {
  assertSafeSessionId(sessionId);
  const meta = await readMeta(createSessionStorePaths(join(sessionRoot, sessionId)).metaPath);
  if (!meta) throw new CliUsageError(`Session not found: ${sessionId}`, "SESSION_NOT_FOUND");
  if (!meta.workspaceRoot || resolve(meta.workspaceRoot) !== workspace) {
    throw new CliUsageError(
      `Session ${sessionId} belongs to a different workspace.`,
      "SESSION_WORKSPACE_MISMATCH",
    );
  }
  const lock = await acquireSessionLock(sessionRoot, sessionId);
  return { sessionId, lock };
}

function renderSessions(sessions: SessionListItem[], write: (text: string) => void): void {
  if (sessions.length === 0) {
    write("No sessions.\n");
    return;
  }
  for (const session of sessions) {
    write(`${session.id}\t${session.agentRunCount}\t${session.title}\n`);
  }
}

async function resolveWorkspace(workspace: string | undefined, cwd: string): Promise<string> {
  const absolute = resolve(workspace ?? cwd);
  try {
    if (!(await stat(absolute)).isDirectory()) throw new Error("not a directory");
  } catch {
    throw new CliUsageError(`Workspace is not an accessible directory: ${absolute}`, "INVALID_WORKSPACE");
  }
  return absolute;
}

function shortId(sessionId: string): string {
  return sessionId.length <= 12 ? sessionId : sessionId.slice(-8);
}

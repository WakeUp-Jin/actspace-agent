import { JsonlSessionStorage } from "@actspace/session-persistence-jsonl";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MainAgentInbox } from "@actspace/agent";
import { BackgroundTaskRegistry } from "@actspace/background-tasks";
import { AgentScope } from "@actspace/scope";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { SessionStore, type SessionHandle } from "@actspace/session-persistence";
import { OutputTail } from "../external-cli.js";
import type { ExternalRunResult, ExternalStartInput, ExternalSubagentBackend } from "../external.js";
import { isExternalRecordPath, SubagentManager, subagentTree } from "../manager.js";
import { externalAgentDescription, SUBAGENT_LIMIT_REACHED } from "../messages.js";
import type { SubagentToolOutcome } from "../types.js";

// 外部子智能体（设计 04）走 SubagentManager 的并发计数、事件，后台时同样登记进后台任务；记录是 CLI 自己的会话日志。
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

/** A scripted CLI run: the test decides when the log appears and how the run ends. */
class FakeBackend implements ExternalSubagentBackend {
  readonly starts: ExternalStartInput[] = [];
  readonly interrupts: string[] = [];
  readonly runs: { path: string; finish(result: ExternalRunResult): void }[] = [];
  startError: Error | undefined;
  constructor(readonly kind: "codex" | "claude-code", readonly label: string, readonly toolName: string, private readonly logDir: string, private readonly writeLog: "now" | "never" = "now") {}
  available = async () => ({ ok: true as const, command: "/usr/local/bin/fake" });
  start = async (input: ExternalStartInput) => {
    this.starts.push(input);
    if (this.startError) throw this.startError;
    const path = join(this.logDir, `rollout-${this.runs.length}.jsonl`);
    if (this.writeLog === "now") await writeFile(path, "{}\n");
    let finish!: (result: ExternalRunResult) => void;
    const result = new Promise<ExternalRunResult>(resolve => { finish = resolve; });
    this.runs.push({ path, finish });
    return { transcriptPath: path, result, interrupt: async () => { this.interrupts.push(path); finish({ status: "interrupted", text: "" }); } };
  };
}

async function fixture(options: { limit?: number; dataRoot?: string } = {}) {
  const dataRoot = options.dataRoot ?? await mkdtemp(join(tmpdir(), "actspace-external-")); if (!options.dataRoot) roots.push(dataRoot);
  const logDir = realpathSync(dataRoot);
  const registry = createCoreCodecRegistry();
  const store = new SessionStore({ registry }, new JsonlSessionStorage({ dataRoot, runtimeId: "runtime", registry }));
  const live = new Map<string, SessionHandle>();
  const root = options.dataRoot ? await store.open("root") : await store.create({ sessionId: "root", createdAt: "2026-11-04T10:00:00.000Z", cwd: logDir, lineage: null, createdWith: { profileId: "base", runtimeContractVersion: "2", manifestDigest: "manifest", plugins: [{ id: "@actspace/core", version: "2" }], codecSetDigest: registry.digest } });
  live.set("root", root);
  const rootScope = new AgentScope("main:root");
  const woken: string[] = [], refreshed: string[] = [];
  const backgroundTasks = new BackgroundTaskRegistry({ openSession: async id => live.get(id) ?? store.open(id), wake: id => { woken.push(id); }, onError: error => { throw error; } });
  const manager = new SubagentManager({
    store, manifestDigest: "manifest", plugins: [{ id: "@actspace/core", version: "2" }],
    openSession: async id => live.get(id) ?? store.open(id),
    getOpenSession: id => live.get(id),
    acquireRun: async () => { throw new Error("external subagents take no Harness lease"); },
    transcriptPath: id => `/data/sessions-v2/${id}/transcript.md`,
    refreshTranscript: async id => { refreshed.push(id); },
    models: () => ({ listUsableModels: () => [], subagentDefaultModel: () => null }),
    parentConfiguration: () => ({}),
    permissionMode: () => "default",
    isSessionRunning: () => false,
    wake: id => { woken.push(id); },
    backgroundTasks,
    onError: error => { throw error; },
    now: () => new Date("2026-11-04T10:30:00.000Z"),
    externalLogWaitMs: 60,
    syncWaitMs: 2_000,
    ...(options.limit === undefined ? {} : { limit: options.limit }),
  });
  const codex = new FakeBackend("codex", "Codex", "agent_codex", logDir);
  const claude = new FakeBackend("claude-code", "Claude Code", "agent_claude_code", logDir, "never");
  const spawn = (backend: ExternalSubagentBackend, input: { background?: boolean; model?: string; signal?: AbortSignal } = {}) => manager.spawnExternal(backend, {
    sessionId: "root", callId: `call-${Math.random().toString(16).slice(2)}`, scope: rootScope,
    description: "list packages", prompt: "List the packages under packages/subagent.", background: input.background ?? false,
    ...(input.model ? { model: input.model } : {}), signal: input.signal ?? new AbortController().signal,
  });
  const close = async () => { await backgroundTasks.dispose(); await manager.dispose(); await root.close().catch(() => undefined); await rootScope.dispose(); await store.storage.close(); };
  return { dataRoot, logDir, store, root, manager, backgroundTasks, rootScope, woken, refreshed, codex, claude, spawn, close };
}

async function until(check: () => boolean, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) { if (Date.now() > deadline) throw new Error("timed out"); await new Promise(resolve => setTimeout(resolve, 5)); }
}
function idOf(outcome: SubagentToolOutcome): string { return /subagent ([0-9a-f-]{36})/i.exec(outcome.text)![1]; }
const settledCount = (root: SessionHandle, agentId: string) => subagentTree(root).agents[agentId]?.activations.filter(item => item.settle).length ?? 0;

describe("external subagents", () => {
  it("runs a Codex task in the background, records it like any subagent and notifies the parent", async () => {
    const f = await fixture();
    const started = await f.spawn(f.codex, { model: "gpt-5.5", background: true });
    const agentId = idOf(started), path = f.codex.runs[0].path;
    expect(f.codex.starts[0]).toMatchObject({ prompt: "List the packages under packages/subagent.", cwd: f.logDir, model: "gpt-5.5" });
    expect(started.text).toBe([
      `Started Codex subagent ${agentId} (list packages) in the background.`,
      `transcript: ${path}`,
      "You will be notified when it finishes. task_stop stops it.",
    ].join("\n"));
    expect(started.ok && started.detail).toEqual([
      { label: "actspace.context.trace", value: { kind: "trace", path, description: "Subagent transcript: list packages" } },
      { label: "delegation", value: { childSessionId: agentId, agentId, kind: "codex", description: "list packages", transcriptPath: path, background: true, status: "running" } },
    ]);
    expect(subagentTree(f.root).agents[agentId]).toMatchObject({ kind: "codex", status: "running", transcriptPath: path, activations: [{ trigger: "spawn", background: true, model: "gpt-5.5" }] });
    expect(f.backgroundTasks.list("root")).toMatchObject([{ taskId: agentId, kind: "agent", agent: { transcriptPath: path, label: "codex" } }]);

    f.codex.runs[0].finish({ status: "completed", text: "subagent, subagent-codex, subagent-claude-code" });
    await until(() => settledCount(f.root, agentId) === 1 && f.manager.runningCount("root") === 0);
    const view = subagentTree(f.root).agents[agentId];
    expect(view.status).toBe("closed");
    expect(view.activations[0].settle).toMatchObject({ status: "completed", delivery: "notified", result: "subagent, subagent-codex, subagent-claude-code", summary: `Subagent ${agentId} finished.` });
    await until(() => new MainAgentInbox(f.root).pending().length === 1);
    const notice = String(new MainAgentInbox(f.root).pending()[0].content);
    expect(notice).toContain(`<transcript>${path}</transcript>`);
    expect(notice).toContain("<closing_message>\nsubagent, subagent-codex, subagent-claude-code\n</closing_message>");
    expect(f.woken).toEqual(["root"]);
    // No ActSpace transcript exists for an external run.
    expect(f.refreshed).not.toContain(agentId);
    // One run, no continuation.
    expect(await f.manager.sendMessage({ sessionId: "root", callId: "m", agentId, message: "more" })).toEqual({ ok: false, code: "SUBAGENT_CLOSED", text: `${agentId} is an external subagent and cannot receive messages.` });
    await f.close();
  });

  it("returns a synchronous Claude Code result and says when the log file is not there yet", async () => {
    const f = await fixture();
    const pending = f.spawn(f.claude);
    await until(() => f.claude.runs.length === 1);
    const path = f.claude.runs[0].path;
    f.claude.runs[0].finish({ status: "completed", text: "Three packages." });
    const outcome = await pending;
    const agentId = idOf(outcome);
    expect(outcome.text).toBe([`Subagent ${agentId} (list packages) finished.`, `transcript: ${path} (the log file does not exist yet)`, "", "Three packages."].join("\n"));
    // Not written yet: returned, but not registered as an active path.
    expect(outcome.ok && outcome.detail).toEqual([{ label: "delegation", value: { childSessionId: agentId, agentId, kind: "claude-code", description: "list packages", transcriptPath: path, background: false, status: "completed" } }]);
    expect(subagentTree(f.root).agents[agentId].activations[0].settle).toMatchObject({ status: "completed", delivery: "returned" });
    expect(new MainAgentInbox(f.root).pending()).toEqual([]);
    await f.close();
  });

  it("stops for good on task_stop and reports a failure with the CLI's first error line", async () => {
    const f = await fixture();
    const agentId = idOf(await f.spawn(f.codex, { background: true }));
    expect(await f.backgroundTasks.stop("root", agentId, "Stopped by the agent.")).toMatchObject({ status: "stopped" });
    expect(settledCount(f.root, agentId)).toBe(1);
    expect(f.codex.interrupts).toEqual([f.codex.runs[0].path]);
    expect(subagentTree(f.root).agents[agentId]).toMatchObject({ status: "closed", activations: [{ settle: { status: "interrupted", delivery: "stopped", summary: `Subagent ${agentId} was stopped before it finished.` } }] });
    expect(await f.backgroundTasks.stop("root", agentId, "again")).toMatchObject({ status: "stopped" });

    const failed = idOf(await f.spawn(f.codex, { background: true }));
    f.codex.runs[1].finish({ status: "failed", text: "", error: "Codex is not logged in. Run codex login in a terminal.\nmore detail" });
    await until(() => settledCount(f.root, failed) === 1);
    expect(subagentTree(f.root).agents[failed].activations[0].settle).toMatchObject({ status: "failed", summary: `Subagent ${failed} failed before it finished: Codex is not logged in. Run codex login in a terminal.` });
    await until(() => new MainAgentInbox(f.root).pending().length === 1);
    expect(String(new MainAgentInbox(f.root).pending()[0].content)).toContain("<status>failed</status>");
    await f.close();
  });

  it("fails the call without recording anything when the CLI cannot start", async () => {
    const f = await fixture();
    f.codex.startError = new Error("spawn codex ENOENT\nstack");
    expect(await f.spawn(f.codex)).toEqual({ ok: false, code: "SUBAGENT_FAILED", text: "Codex could not start: spawn codex ENOENT" });
    expect(subagentTree(f.root).order).toEqual([]);
    expect(f.manager.runningCount("root")).toBe(0);
    await f.close();
  });

  it("shares the per-Session limit with local subagents", async () => {
    const f = await fixture({ limit: 1 });
    await f.spawn(f.codex, { background: true });
    expect(await f.spawn(f.claude)).toEqual({ ok: false, code: "SUBAGENT_LIMIT", text: SUBAGENT_LIMIT_REACHED });
    expect(f.claude.starts).toEqual([]);
    await f.close();
  });

  it("kills the CLI on shutdown and reports the run as lost after a restart", async () => {
    const first = await fixture();
    const agentId = idOf(await first.spawn(first.codex, { background: true }));
    const path = first.codex.runs[0].path;
    await first.close();
    expect(first.codex.interrupts).toEqual([path]);
    // Shutdown records nothing; the next start does.
    expect(subagentTree(first.root).agents[agentId].status).toBe("running");

    const second = await fixture({ dataRoot: first.dataRoot });
    await second.backgroundTasks.reconcile(second.root);
    await second.manager.recoverLost(second.root);
    expect(subagentTree(second.root).agents[agentId]).toMatchObject({ status: "closed", activations: [{ settle: { status: "lost", delivery: "lost", summary: `Subagent ${agentId} (list packages) was interrupted because the app exited. Its transcript shows how far it got.` } }] });
    expect(String(new MainAgentInbox(second.root).pending()[0].content)).toContain(`<transcript>${path}</transcript>`);
    // The exact record stays readable after the restart; its neighbours do not.
    expect(isExternalRecordPath(second.root, path)).toBe(true);
    expect(isExternalRecordPath(second.root, join(second.logDir, "rollout-9.jsonl"))).toBe(false);
    expect(isExternalRecordPath(second.root, second.logDir)).toBe(false);
    await second.close();
  });

  it("picks the line that says why a CLI exited", () => {
    // A broken npm install of codex: the launcher's spawn error, a stack and an object dump.
    const node = new OutputTail();
    node.push("Error: spawn /opt/homebrew/lib/node_modules/@openai/codex/vendor/codex ENOENT\n    at ChildProcess._handle.onexit (node:internal/child_process:285:19)\n    at onErrorNT (node:internal/child_process:483:16) {\n  errno: -2,\n  code: 'ENOENT',\n");
    node.push("  spawnargs: [ 'app-server' ]\n}\n");
    expect(node.lastLine()).toBe("Error: spawn /opt/homebrew/lib/node_modules/@openai/codex/vendor/codex ENOENT");
    const plain = new OutputTail();
    plain.push("warning: noise\nsomething went wrong\n");
    expect(plain.lastLine()).toBe("something went wrong");
    expect(new OutputTail().lastLine()).toBeUndefined();
  });

  it("describes each tool with the CLI's name", () => {
    expect(externalAgentDescription("Claude Code")).toBe("Run a task with the local Claude Code CLI as a subagent, in this workspace. It runs once and cannot receive messages. It uses Claude Code's own permissions (no approval prompts) and its own model settings. You get its final message and the path of its native session log (JSONL; long lines). By default the call waits for the result; with background: true it returns at once, you are notified when it finishes, and task_stop stops it.");
  });
});

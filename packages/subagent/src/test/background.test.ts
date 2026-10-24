import { JsonlSessionStorage } from "@actspace/session-jsonl";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { SessionStore } from "@actspace/session-persistence";
import { AgentScope } from "@actspace/core-scope";
import { MainAgentInbox } from "@actspace/core-agent";
import { BackgroundTaskRegistry } from "@actspace/background-tasks";
import type { ToolBodyResult, ToolExecutionContext, ToolRuntime } from "@actspace/tools-runtime";
import { createBuiltInPresets } from "../preset.js";
import { OneShotSubagentProvider } from "../provider.js";
import { registerSubagentTools } from "../tool-plugin.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

type Execute = (args: Record<string, unknown>, context: ToolExecutionContext) => Promise<ToolBodyResult>;

/** Children run until released or aborted; `finalText` is what a released child returns. */
async function fixture(finalText = "child findings") {
  const root = await mkdtemp(join(tmpdir(), "actspace-subagent-bg-")); roots.push(root);
  const registry = createCoreCodecRegistry(); const store = new SessionStore({ registry }, new JsonlSessionStorage({ dataRoot: root, runtimeId: "runtime", registry }));
  const parent = await store.create({ sessionId: "parent", createdAt: "2026-10-22T12:00:00.000Z", lineage: null, createdWith: { profileId: "base", runtimeContractVersion: "2", manifestDigest: "manifest", plugins: [{ id: "@actspace/core", version: "2" }], codecSetDigest: registry.digest } });
  const scope = new AgentScope("main", undefined, "root");
  const releases: (() => void)[] = [];
  const provider = new OneShotSubagentProvider({ store, presets: createBuiltInPresets([]), manifestDigest: "manifest", plugins: [], createLoop: ({ signal }) => ({
    abort: () => undefined, quiesce: () => undefined, waitForIdle: async () => undefined,
    runTurn: () => new Promise(resolve => {
      releases.push(() => resolve({ agentRunId: "run", turnId: "turn", reason: "completed", steps: 1, finalText }));
      signal.addEventListener("abort", () => resolve({ agentRunId: "run", turnId: "turn", reason: "aborted", steps: 1, finalText: "" }), { once: true });
    }),
  }) as never });
  const wakes: string[] = [];
  const tasks = new BackgroundTaskRegistry({ openSession: async () => parent, wake: id => wakes.push(id) });
  const executors = new Map<string, Execute>();
  const runtime = { register: ({ definition, executor }: { definition: { name: string }; executor: { execute: Execute } }) => { executors.set(definition.name, executor.execute); return { dispose: async () => undefined, beginDrain: () => undefined }; }, registry: { listDefinitions: () => [] } } as unknown as ToolRuntime;
  registerSubagentTools(runtime, provider, () => ({ session: parent, scope }), tasks);
  let call = 0;
  const run = (args: Record<string, unknown>, signal = new AbortController().signal) => executors.get("agent")!(args, { sessionId: "parent", callId: `call-${++call}`, signal } as ToolExecutionContext);
  const cleanup = async () => { await tasks.dispose(); await provider.dispose("test"); await parent.close(); await scope.dispose(); };
  return { parent, provider, tasks, wakes, releases, run, cleanup, inbox: () => new MainAgentInbox(parent) };
}

const text = (result: ToolBodyResult) => result.modelOutput.map(block => block.type === "text" ? block.text : "").join("");

describe("background subagent", () => {
  it("returns at once, outlives the parent turn and notifies with a bounded result", async () => {
    const { tasks, wakes, releases, run, cleanup, inbox } = await fixture("界".repeat(4_000));
    const controller = new AbortController();
    const result = await run({ task: "investigate the cache\nwith details", background: true }, controller.signal);
    expect(result.status).toBe("completed");
    expect(text(result)).toContain("automatic_notification: true");
    const taskId = text(result).match(/task_id: (agent_\S+)/)![1]!;
    expect(result.detail).toEqual([{ label: "delegation", value: expect.objectContaining({ background: true, status: "running", taskId }) }]);
    controller.abort();
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(tasks.get("parent", taskId)).toMatchObject({ status: "running", description: "investigate the cache" });
    releases[0]!();
    await vi.waitFor(() => expect(inbox().pending()).toHaveLength(1));
    const notification = String(inbox().pending()[0]!.content);
    expect(notification).toContain("<result>");
    expect(notification).toContain("Result truncated at 8KB");
    expect(Buffer.byteLength(notification)).toBeLessThan(9_000);
    expect(tasks.get("parent", taskId).status).toBe("completed");
    expect(wakes).toEqual(["parent"]);
    await cleanup();
  });

  it("rejects a fifth running background agent", async () => {
    const { run, cleanup } = await fixture();
    for (let index = 0; index < 4; index += 1) expect((await run({ task: `task ${index}`, background: true })).status).toBe("completed");
    const fifth = await run({ task: "one too many", background: true });
    expect(fifth).toMatchObject({ status: "failed", failure: { code: "BACKGROUND_TASK_LIMIT" } });
    await cleanup();
  });

  it("stops through the registry without a completion notification", async () => {
    const { parent, tasks, run, cleanup, inbox } = await fixture();
    const taskId = text(await run({ task: "long scan", background: true })).match(/task_id: (agent_\S+)/)![1]!;
    await expect(tasks.stop("parent", taskId, "not needed")).resolves.toMatchObject({ status: "stopped" });
    expect(inbox().pending()).toEqual([]);
    expect(parent.journal.events.filter(event => event.type === "delegation/completed")).toHaveLength(1);
    await cleanup();
  });
});

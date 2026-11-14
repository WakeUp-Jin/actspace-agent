import { JsonlSessionStorage } from "@actspace/session-persistence-jsonl";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MainAgentInbox } from "@actspace/agent";
import { BackgroundTaskRegistry } from "@actspace/background-tasks";
import { AgentScope } from "@actspace/scope";
import { createCoreCodecRegistry, FORKED_SUBAGENT_PRESET_ID } from "@actspace/session-journal";
import { SessionStore, type SessionHandle } from "@actspace/session-persistence";
import type { UsableModelSummary } from "@actspace/shared";
import {
  SubagentManager,
  subagentTree,
  type ChildLoop,
  type ChildLoopInput,
  type ParentConfiguration,
} from "../manager.js";
import { SUBAGENT_APPROVAL_UNAVAILABLE, SUBAGENT_LIMIT_REACHED, taskGuidance } from "../messages.js";
import type { SubagentToolOutcome } from "../types.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

type TurnInput = {
  readonly content: unknown;
  readonly wake?: boolean;
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly thinkingEnabled?: boolean;
  readonly mode?: string;
  readonly selectedSkillIds?: readonly string[];
};
type TurnContext = {
  readonly session: SessionHandle;
  readonly input: TurnInput;
  readonly claimed: readonly unknown[];
  readonly signal: AbortSignal;
  readonly loop: ChildLoopInput;
  readonly turn: number;
};
type TurnScript = (
  context: TurnContext,
) => Promise<{ readonly reason: string; readonly steps?: number; readonly finalText?: string }>;

const MODELS: UsableModelSummary[] = [
  { key: "conn/fast", label: "Fast", connectionLabel: "Relay", reasoningEfforts: [], thinkingDefault: false },
  {
    key: "conn/deep",
    label: "Deep",
    connectionLabel: "Relay",
    reasoningEfforts: ["low", "medium", "high"],
    defaultEffort: "medium",
    thinkingDefault: true,
  },
];

async function fixture(
  options: {
    script?: TurnScript;
    syncWaitMs?: number;
    setting?: string | null;
    dataRoot?: string;
    parent?: ParentConfiguration;
  } = {},
) {
  const dataRoot = options.dataRoot ?? (await mkdtemp(join(tmpdir(), "actspace-subagent-")));
  if (!options.dataRoot) roots.push(dataRoot);
  const registry = createCoreCodecRegistry();
  const store = new SessionStore({ registry }, new JsonlSessionStorage({ dataRoot, runtimeId: "runtime", registry }));
  const live = new Map<string, SessionHandle>();
  const root = options.dataRoot
    ? await store.open("root")
    : await store.create({
        sessionId: "root",
        createdAt: "2026-11-03T10:00:00.000Z",
        lineage: null,
        createdWith: {
          profileId: "base",
          runtimeContractVersion: "2",
          manifestDigest: "manifest",
          plugins: [{ id: "@actspace/core", version: "2" }],
          codecSetDigest: registry.digest,
        },
      });
  live.set("root", root);
  const rootScope = new AgentScope("main:root");
  const refreshed: string[] = [],
    woken: string[] = [],
    turns: TurnInput[] = [],
    loops: ChildLoopInput[] = [],
    finished: string[] = [];
  let script: TurnScript = options.script ?? (async () => ({ reason: "completed", steps: 1, finalText: "done" }));
  let rootRunning = false;
  const backgroundTasks = new BackgroundTaskRegistry({
    openSession: async (id) => live.get(id) ?? store.open(id),
    wake: (id) => {
      woken.push(id);
    },
    onError: (error) => {
      throw error;
    },
  });
  const manager = new SubagentManager({
    store,
    manifestDigest: "manifest",
    plugins: [{ id: "@actspace/core", version: "2" }],
    openSession: async (id) => live.get(id) ?? store.open(id),
    getOpenSession: (id) => live.get(id),
    acquireRun: async ({ scope }) => {
      const leaseScope = scope.child(`lease-${loops.length}`);
      let session: SessionHandle | undefined;
      return {
        scope: leaseScope,
        start: async (child, content) => {
          session = child;
          const messageId = `m-${Math.random().toString(16).slice(2)}`;
          await child.append({
            type: "user/message",
            eventVersion: 1,
            source: { ownerPluginId: "@actspace/core" },
            data: { messageId, content },
            surface: null,
          } as never);
          return { messageId };
        },
        createLoop: async (input) => {
          loops.push(input);
          live.set(input.session.header.sessionId, input.session);
          let turn = 0;
          const loop: ChildLoop = {
            runTurn: (async (turnInput: TurnInput) => {
              turns.push(turnInput);
              const inbox = new MainAgentInbox(input.session);
              if (turnInput.wake && !inbox.hasPendingNotifications())
                return { reason: "completed", steps: 0, finalText: "" };
              const claimed = (await inbox.claim()).map((item) => item.content);
              const result = await script({
                session: input.session,
                input: turnInput,
                claimed,
                signal: input.signal,
                loop: input,
                turn: turn++,
              });
              return { steps: 1, finalText: "", ...result };
            }) as never,
            abort: () => undefined,
            waitForIdle: async () => undefined,
            quiesce: () => undefined,
          };
          return loop;
        },
        finish: async (outcome) => {
          finished.push(outcome);
        },
        release: async () => {
          if (session) live.delete(session.header.sessionId);
          await leaseScope.dispose();
        },
      };
    },
    transcriptPath: (id) => `/data/sessions-v2/${id}/transcript.md`,
    refreshTranscript: async (id) => {
      refreshed.push(id);
    },
    models: () => ({ listUsableModels: () => MODELS, subagentDefaultModel: () => options.setting ?? null }),
    parentConfiguration: () => options.parent ?? { model: "conn/fast", thinkingEnabled: false },
    permissionMode: () => "full-access",
    isSessionRunning: (id) => (id === "root" ? rootRunning : false),
    wake: (id) => {
      woken.push(id);
    },
    backgroundTasks,
    onError: (error) => {
      throw error;
    },
    now: () => new Date("2026-11-03T10:30:00.000Z"),
    ...(options.syncWaitMs === undefined ? {} : { syncWaitMs: options.syncWaitMs }),
  });
  const spawn = (
    input: {
      description?: string;
      prompt?: string;
      background?: boolean;
      preset?: "general" | "explore";
      model?: string;
      reasoningEffort?: string;
      signal?: AbortSignal;
    } = {},
  ) =>
    manager.spawn({
      sessionId: "root",
      callId: `call-${Math.random().toString(16).slice(2)}`,
      scope: rootScope,
      description: input.description ?? "review auth",
      prompt: input.prompt ?? "Review the auth module.",
      preset: input.preset ?? "general",
      background: input.background ?? false,
      ...(input.model ? { model: input.model } : {}),
      ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
      parentToolNames: ["read_file", "write_file", "bash", "agent", "task_output", "task_stop", "send_message"],
      registeredToolNames: [
        "read_file",
        "write_file",
        "bash",
        "grep",
        "glob",
        "list_directory",
        "agent",
        "task_output",
        "task_stop",
        "send_message",
      ],
      signal: input.signal ?? new AbortController().signal,
    });
  const settled = async (agentId: string, count = 1) => {
    await until(
      () =>
        (subagentTree(root).agents[agentId]?.activations.filter((item) => item.settle).length ?? 0) >= count &&
        !manager.runningCount("root"),
    );
    return subagentTree(root).agents[agentId];
  };
  // Host order: the registry first (it stops background subagents), then the manager.
  const close = async () => {
    await backgroundTasks.dispose();
    await manager.dispose();
    for (const session of live.values()) await session.close().catch(() => undefined);
    await rootScope.dispose();
    await store.storage.close();
  };
  return {
    dataRoot,
    store,
    root,
    live,
    manager,
    backgroundTasks,
    rootScope,
    refreshed,
    woken,
    turns,
    loops,
    finished,
    spawn,
    settled,
    close,
    setScript: (next: TurnScript) => {
      script = next;
    },
    setRootRunning: (value: boolean) => {
      rootRunning = value;
    },
  };
}

async function until(check: () => boolean, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function idOf(outcome: SubagentToolOutcome): string {
  return /subagent ([0-9a-f-]{36})/i.exec(outcome.text)![1];
}
function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}
function pendingTexts(session: SessionHandle): string[] {
  return new MainAgentInbox(session).pending().map((item) => String(item.content));
}

describe("SubagentManager", () => {
  it("starts a background subagent as a background task and notifies the parent through the registry", async () => {
    const hold = gate();
    const f = await fixture({
      script: async () => {
        await hold.promise;
        return { reason: "completed", finalText: "Auth looks fine." };
      },
    });
    const started = await f.spawn({ background: true });
    expect(started.ok).toBe(true);
    const agentId = idOf(started);
    const transcript = `/data/sessions-v2/${agentId}/transcript.md`;
    expect(started.text).toBe(
      [
        `Started subagent ${agentId} (review auth) in the background.`,
        `transcript: ${transcript}`,
        "You will be notified when it finishes. Use send_message only to give it information it is missing; task_stop stops it.",
      ].join("\n"),
    );
    expect(started.ok && started.detail).toEqual([
      {
        label: "actspace.context.trace",
        value: { kind: "trace", path: transcript, description: "Subagent transcript: review auth" },
      },
      {
        label: "delegation",
        value: {
          childSessionId: agentId,
          agentId,
          kind: "local",
          preset: "general",
          description: "review auth",
          transcriptPath: transcript,
          background: true,
          status: "running",
        },
      },
    ]);
    // The transcript was written with the task before the path went out.
    expect(f.refreshed).toContain(agentId);
    const child = f.live.get(agentId)!;
    expect(child.header.lineage).toMatchObject({ parentSessionId: "root", origin: "delegation", delegationDepth: 1 });
    expect(child.journal.events.find((event) => event.type === "permission/mode-set")?.data).toMatchObject({
      mode: "full-access",
      source: "parent",
    });
    expect(f.turns[0]).toMatchObject({
      content: `Review the auth module.\n\n${taskGuidance(transcript, "general")}`,
      model: "conn/fast",
      thinkingEnabled: false,
    });
    expect(f.loops[0]).toMatchObject({
      agentId,
      preset: "general",
      maxSteps: 1000,
      allowedToolNames: ["bash", "read_file", "send_message", "write_file"],
    });
    expect(subagentTree(f.root).agents[agentId]).toMatchObject({
      status: "running",
      toolNames: ["bash", "read_file", "send_message", "write_file"],
    });
    // A background task of kind `agent`, keyed by the agent id; its start names the transcript.
    expect(f.backgroundTasks.list("root")).toEqual([
      expect.objectContaining({
        taskId: agentId,
        kind: "agent",
        status: "running",
        description: "review auth",
        agent: { transcriptPath: transcript, label: "general" },
      }),
    ]);
    expect(f.root.journal.events.find((event) => event.type === "background/task")?.data).toMatchObject({
      op: "start",
      taskId: agentId,
      kind: "agent",
      transcriptPath: transcript,
    });
    hold.open();
    const view = await f.settled(agentId);
    expect(view).toMatchObject({
      status: "closed",
      activations: [
        {
          trigger: "spawn",
          background: true,
          model: "conn/fast",
          settle: { status: "completed", delivery: "notified", result: "Auth looks fine." },
        },
      ],
    });
    // The registry wakes the parent last, after the notice is in the inbox and the settle record is written.
    await until(() => pendingTexts(f.root).length === 1 && f.woken.length > 0);
    expect(pendingTexts(f.root)).toEqual([
      [
        "<task_notification>",
        `<task_id>${agentId}</task_id>`,
        "<kind>agent</kind>",
        "<description>review auth</description>",
        "<status>completed</status>",
        `<summary>Subagent ${agentId} finished.</summary>`,
        `<transcript>${transcript}</transcript>`,
        "<closing_message>",
        "Auth looks fine.",
        "</closing_message>",
        "</task_notification>",
      ].join("\n"),
    ]);
    expect(new MainAgentInbox(f.root).pending()[0]).toMatchObject({
      source: "task_notification",
      notice: { taskId: agentId, kind: "subagent", title: "review auth", status: "completed" },
    });
    expect(f.backgroundTasks.get("root", agentId)).toMatchObject({ status: "completed" });
    expect(f.woken).toEqual(["root"]);
    expect(f.finished).toEqual(["completed"]);
    expect(f.live.has(agentId)).toBe(false);
    await f.close();
  });

  it("returns a synchronous result by default and hands a long call to the registry", async () => {
    const f = await fixture({ syncWaitMs: 30 });
    const done = await f.spawn();
    const first = idOf(done);
    expect(done.text).toBe(
      `Subagent ${first} (review auth) finished.\ntranscript: /data/sessions-v2/${first}/transcript.md\n\ndone`,
    );
    expect(subagentTree(f.root).agents[first].activations[0]).toMatchObject({
      background: false,
      settle: { delivery: "returned" },
    });
    expect(f.backgroundTasks.list("root", { activeOnly: false })).toEqual([]);
    expect(pendingTexts(f.root)).toEqual([]);

    const hold = gate();
    f.setScript(async () => {
      await hold.promise;
      return { reason: "completed", finalText: "late" };
    });
    const moved = await f.spawn({ description: "slow job" });
    const second = idOf(moved);
    expect(moved.text.split("\n")[0]).toBe(
      `Subagent ${second} (slow job) is still running and has moved to the background (30 minute wait limit).`,
    );
    expect(f.backgroundTasks.get("root", second)).toMatchObject({ kind: "agent", status: "running" });
    hold.open();
    await f.settled(second);
    expect(subagentTree(f.root).agents[second].activations[0].settle).toMatchObject({ delivery: "notified" });
    await until(() => pendingTexts(f.root).length === 1);
    expect(pendingTexts(f.root)[0]).toContain("<closing_message>\nlate\n</closing_message>");
    await f.close();
  });

  it("stops a synchronous subagent when the parent's call is cancelled", async () => {
    const f = await fixture({
      script: async ({ signal }) => {
        await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
        return { reason: "aborted" };
      },
    });
    const parent = new AbortController();
    const pending = f.spawn({ signal: parent.signal });
    await until(() => f.turns.length === 1);
    parent.abort();
    const result = await pending;
    expect(result.text.split("\n")[0]).toMatch(/was stopped before it finished\.$/);
    await f.close();
  });

  it("steers a running subagent, turns a late message into another turn, and refuses one after it finished", async () => {
    const hold = gate();
    const seen: unknown[][] = [];
    const f = await fixture({
      script: async ({ claimed, turn }) => {
        seen.push([...claimed]);
        if (turn === 0) await hold.promise;
        return { reason: "completed", finalText: `turn ${turn}` };
      },
    });
    const agentId = idOf(await f.spawn({ background: true }));
    await until(() => seen.length === 1);
    // The first Turn already took its last step: the message waits in the inbox until settlement checks it.
    const sent = await f.manager.sendMessage({
      sessionId: "root",
      callId: "c2",
      scope: f.rootScope,
      agentId,
      message: "One more thing.",
    });
    expect(sent).toEqual({
      ok: true,
      text: `Message delivered to ${agentId} (running; it will see it at its next step).`,
    });
    hold.open();
    const view = await f.settled(agentId);
    expect(view.activations).toHaveLength(1);
    expect(seen[1]).toEqual([`<agent_message from="root" relation="parent">\nOne more thing.\n</agent_message>`]);
    expect(view.activations[0].settle).toMatchObject({ result: "turn 1" });
    // Finished means closed: no continuation.
    expect(
      await f.manager.sendMessage({
        sessionId: "root",
        callId: "c3",
        scope: f.rootScope,
        agentId,
        message: "And another.",
      }),
    ).toEqual({
      ok: false,
      code: "SUBAGENT_CLOSED",
      text: `Subagent ${agentId} has finished and cannot receive messages. Start a new subagent if there is more to do.`,
    });
    expect(subagentTree(f.root).agents[agentId].activations).toHaveLength(1);
    await f.close();
  });

  it("task_stop ends a background subagent; the stop result is its delivery", async () => {
    const f = await fixture({
      script: async ({ signal }) => {
        await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
        return { reason: "aborted", finalText: "partial" };
      },
    });
    const agentId = idOf(await f.spawn({ background: true }));
    await until(() => f.turns.length === 1);
    expect(await f.backgroundTasks.stop("root", agentId, "Stopped by the agent.")).toMatchObject({
      taskId: agentId,
      kind: "agent",
      status: "stopped",
    });
    const view = await f.settled(agentId);
    expect(view).toMatchObject({
      status: "closed",
      activations: [{ settle: { status: "interrupted", delivery: "stopped" } }],
    });
    expect(f.finished).toEqual(["cancelled"]);
    expect(f.root.journal.events.filter((event) => event.type === "background/task").at(-1)?.data).toMatchObject({
      op: "settle",
      taskId: agentId,
      status: "stopped",
      delivery: "stopped",
    });
    expect(pendingTexts(f.root)).toEqual([]);
    expect(f.woken).toEqual([]);
    await f.close();
  });

  it("stops from the 子 Agent panel: through the registry when in the background, directly when synchronous", async () => {
    const f = await fixture({
      script: async ({ signal }) => {
        await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
        return { reason: "aborted" };
      },
    });
    const background = idOf(await f.spawn({ background: true }));
    const sync = f.spawn({ description: "sync job" });
    await until(() => f.turns.length === 2);
    expect(await f.manager.stopByUser("root", background)).toEqual({
      ok: true,
      message: `Stopped subagent ${background}.`,
    });
    expect(subagentTree(f.root).agents[background].activations[0].settle).toMatchObject({
      status: "interrupted",
      delivery: "stopped",
    });
    expect(pendingTexts(f.root)).toEqual([
      [
        "<task_notification>",
        `<task_id>${background}</task_id>`,
        "<kind>agent</kind>",
        "<description>review auth</description>",
        "<status>stopped</status>",
        `<summary>The user stopped subagent ${background} (review auth) from the app.</summary>`,
        `<transcript>/data/sessions-v2/${background}/transcript.md</transcript>`,
        "</task_notification>",
      ].join("\n"),
    ]);
    const syncId = Object.keys(subagentTree(f.root).agents).find((id) => id !== background)!;
    expect(await f.manager.stopByUser("root", syncId)).toEqual({ ok: true, message: `Stopped subagent ${syncId}.` });
    expect((await sync).text.split("\n")[0]).toBe(
      `Subagent ${syncId} (sync job) was stopped by the user before it finished.`,
    );
    expect(subagentTree(f.root).agents[syncId].activations[0].settle).toMatchObject({
      status: "interrupted",
      delivery: "returned",
    });
    expect(await f.manager.stopByUser("root", syncId)).toEqual({
      ok: false,
      message: `Subagent ${syncId} is not running.`,
    });
    expect(f.woken).toEqual([]);
    await f.close();
  });

  it("stops every running subagent of a rewinding Session without notifying or waking it", async () => {
    const f = await fixture({
      syncWaitMs: 60_000,
      script: async ({ signal }) => {
        await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
        return { reason: "aborted", finalText: "partial" };
      },
    });
    const background = idOf(await f.spawn({ background: true }));
    const sync = f.spawn({ description: "sync job" });
    await until(() => f.turns.length === 2);
    await f.manager.stopAll("root");
    expect(f.manager.runningCount("root")).toBe(0);
    const tree = subagentTree(f.root);
    expect(tree.agents[background].activations[0].settle).toMatchObject({ status: "interrupted", delivery: "lost" });
    const syncId = Object.keys(tree.agents).find((id) => id !== background)!;
    expect(tree.agents[syncId].activations[0].settle).toMatchObject({ status: "interrupted", delivery: "lost" });
    expect(f.backgroundTasks.get("root", background)).toMatchObject({ status: "stopped" });
    // The synchronous caller still gets its answer: the tool call is closed, not left hanging.
    expect((await sync).text.split("\n")[0]).toMatch(/was stopped before it finished\.$/);
    expect(pendingTexts(f.root)).toEqual([]);
    expect(f.woken).toEqual([]);
    await f.close();
  });

  it("leaves an exit unrecorded; after a restart the tree marks it lost and only the registry tells the model", async () => {
    const first = await fixture({
      syncWaitMs: 60_000,
      script: async ({ signal }) => {
        await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
        return { reason: "aborted" };
      },
    });
    const background = idOf(await first.spawn({ background: true }));
    const sync = first.spawn({ description: "sync job" });
    await until(() => first.turns.length === 2);
    await first.root.flush();
    await first.backgroundTasks.dispose();
    await first.manager.dispose();
    await sync;
    const syncId = Object.keys(subagentTree(first.root).agents).find((id) => id !== background)!;
    // Shutdown does not settle: the next start reports it.
    expect(subagentTree(first.root).agents[background].activations[0].settle).toBeUndefined();
    expect(subagentTree(first.root).agents[syncId].activations[0].settle).toBeUndefined();
    expect(
      first.root.journal.events
        .filter((event) => event.type === "background/task")
        .map((event) => (event.data as { op: string }).op),
    ).toEqual(["start"]);
    await first.close();

    const second = await fixture({ dataRoot: first.dataRoot });
    await second.backgroundTasks.reconcile(second.root);
    await second.manager.recoverLost(second.root);
    const tree = subagentTree(second.root);
    expect(tree.agents[background]).toMatchObject({
      status: "closed",
      activations: [
        {
          settle: {
            status: "lost",
            delivery: "lost",
            summary: `Subagent ${background} (review auth) was interrupted because the app exited. Its transcript shows how far it got.`,
          },
        },
      ],
    });
    expect(tree.agents[syncId]).toMatchObject({
      status: "closed",
      activations: [{ settle: { status: "lost", delivery: "lost" } }],
    });
    expect(pendingTexts(second.root)).toEqual([
      [
        "<task_notification>",
        `<task_id>${background}</task_id>`,
        "<kind>agent</kind>",
        "<description>review auth</description>",
        "<status>lost</status>",
        `<summary>Subagent ${background} (review auth) was interrupted because the app exited. Its transcript shows how far it got; start a new subagent if the work still needs doing.</summary>`,
        `<transcript>/data/sessions-v2/${background}/transcript.md</transcript>`,
        "</task_notification>",
      ].join("\n"),
    ]);
    await second.backgroundTasks.reconcile(second.root);
    await second.manager.recoverLost(second.root);
    expect(subagentTree(second.root).agents[background].activations).toHaveLength(1);
    expect(pendingTexts(second.root)).toHaveLength(1);
    expect(
      await second.manager.sendMessage({
        sessionId: "root",
        callId: "c",
        scope: second.rootScope,
        agentId: background,
        message: "Continue.",
      }),
    ).toMatchObject({ ok: false, code: "SUBAGENT_CLOSED" });
    await second.close();
  });

  it("refuses an eleventh running subagent", async () => {
    const hold = gate();
    const f = await fixture({
      script: async () => {
        await hold.promise;
        return { reason: "completed" };
      },
    });
    for (let index = 0; index < 10; index += 1) expect((await f.spawn({ background: true })).ok).toBe(true);
    expect(await f.spawn({ background: true })).toEqual({
      ok: false,
      code: "SUBAGENT_LIMIT",
      text: SUBAGENT_LIMIT_REACHED,
    });
    expect(SUBAGENT_LIMIT_REACHED).toBe(
      "10 subagents are already running. Wait for one to finish, or stop a background one with task_stop.",
    );
    hold.open();
    await until(() => f.manager.runningCount("root") === 0);
    await f.close();
  });

  it("lets a subagent message its parent only, and keeps its own tools from delegating", async () => {
    const hold = gate();
    const f = await fixture({
      script: async () => {
        await hold.promise;
        return { reason: "completed" };
      },
    });
    const a = idOf(await f.spawn({ description: "a", background: true }));
    const b = idOf(await f.spawn({ description: "b", background: true }));
    await until(() => f.live.has(a) && f.live.has(b) && f.turns.length === 2);
    expect(await f.manager.sendMessage({ sessionId: a, callId: "s1", agentId: b, message: "I own auth.ts." })).toEqual({
      ok: false,
      code: "INVALID_TARGET",
      text: "A subagent can only send messages to its parent.",
    });
    expect(pendingTexts(f.live.get(b)!)).toEqual([]);
    expect(
      await f.manager.sendMessage({ sessionId: a, callId: "s2", agentId: "root", message: "Halfway done." }),
    ).toEqual({ ok: true, text: "Message delivered to root (it was idle and will read it now)." });
    expect(new MainAgentInbox(f.root).pending()[0]).toMatchObject({
      source: "agent_message",
      senderId: a,
      content: `<agent_message from="${a}" relation="child">\nHalfway done.\n</agent_message>`,
      notice: { taskId: a, kind: "agent_message", title: "a", status: "message" },
    });
    expect(f.woken).toEqual(["root"]);
    f.setRootRunning(true);
    expect(await f.manager.sendMessage({ sessionId: a, callId: "s2b", agentId: "root", message: "Almost." })).toEqual({
      ok: true,
      text: "Message delivered to root (running; it will see it at its next step).",
    });
    expect(await f.manager.sendMessage({ sessionId: a, callId: "s3", agentId: a, message: "x" })).toEqual({
      ok: false,
      code: "INVALID_TARGET",
      text: "You cannot send a message to yourself.",
    });
    expect(await f.manager.sendMessage({ sessionId: a, callId: "s3b", agentId: "nope", message: "x" })).toMatchObject({
      ok: false,
      code: "UNKNOWN_AGENT",
    });
    expect(
      await f.manager.sendMessage({ sessionId: "root", callId: "s4", agentId: "nope", message: "x" }),
    ).toMatchObject({
      ok: false,
      text: "Unknown agent nope. Use the agent id the agent call returned, or task_list for background subagents.",
    });
    expect(
      await f.manager.spawn({
        sessionId: a,
        callId: "s5",
        description: "x",
        prompt: "x",
        preset: "general",
        background: true,
        parentToolNames: [],
        registeredToolNames: [],
        signal: new AbortController().signal,
      }),
    ).toEqual({ ok: false, code: "SUBAGENT_BLOCKED", text: "Subagents cannot use agent." });
    hold.open();
    await until(() => f.manager.runningCount("root") === 0);
    await f.close();
  });

  it("replaces the closing message with a note when the subagent's last action was a message to its parent", async () => {
    const f = await fixture({
      script: async ({ session }) => {
        const append = (type: string, data: Record<string, unknown>) =>
          session.append({
            type,
            eventVersion: 1,
            source: { ownerPluginId: "@actspace/core" },
            data,
            surface: null,
          } as never);
        await append("turn/start", { turnId: "turn", agentRunId: "run" });
        await append("step/start", { turnId: "turn", stepId: "step", agentRunId: "run", stepIndex: 1 });
        await append("tool/call", {
          turnId: "turn",
          stepId: "step",
          callId: "t1",
          name: "send_message",
          args: { agent_id: "root", message: "Result: ok" },
        });
        await append("step/end", { turnId: "turn", stepId: "step" });
        await append("turn/end", { turnId: "turn", reason: "completed" });
        return { reason: "completed", finalText: "Sent." };
      },
    });
    const agentId = idOf(await f.spawn({ background: true }));
    await f.settled(agentId);
    await until(() => pendingTexts(f.root).length === 1);
    expect(pendingTexts(f.root)[0]).toContain(
      "<note>It sent you a message just before finishing, so its closing message is omitted.</note>",
    );
    expect(pendingTexts(f.root)[0]).not.toContain("<closing_message>");
    await f.close();
  });

  it("reads a background subagent's transcript tail for task_output", async () => {
    const hold = gate();
    const f = await fixture({
      script: async () => {
        await hold.promise;
        return { reason: "completed" };
      },
    });
    const agentId = idOf(await f.spawn({ background: true }));
    // The fixture's transcript path does not exist: the output is empty, not an error.
    expect(await f.backgroundTasks.output("root", agentId)).toMatchObject({
      task: { taskId: agentId, kind: "agent" },
      output: { text: "" },
    });
    hold.open();
    await f.settled(agentId);
    await f.close();
  });

  it("chooses models from the request, the setting or the parent, and lists them", async () => {
    const f = await fixture({ setting: "conn/deep" });
    expect(await f.spawn({ model: "nope" })).toEqual({
      ok: false,
      code: "UNKNOWN_MODEL",
      text: "Unknown model nope. Call list_subagent_models to see the available models.",
    });
    expect(await f.spawn({ model: "conn/deep", reasoningEffort: "max" })).toEqual({
      ok: false,
      code: "UNKNOWN_EFFORT",
      text: "Unknown reasoning effort max for conn/deep. Call list_subagent_models to see the available efforts.",
    });
    await f.settled(idOf(await f.spawn()));
    expect(f.turns.at(-1)).toMatchObject({ model: "conn/deep", thinkingEnabled: true, reasoningEffort: "medium" });
    await f.settled(idOf(await f.spawn({ model: "conn/fast" })));
    expect(f.turns.at(-1)).toMatchObject({ model: "conn/fast", thinkingEnabled: false });
    expect((await f.manager.listModels({ sessionId: "root", callId: "m" })).text).toBe(
      [
        "Default subagent model: conn/deep",
        "- conn/fast — Fast · Relay",
        "- conn/deep — Deep · Relay · efforts: low, medium, high (default medium)",
      ].join("\n"),
    );
    await f.close();
    const g = await fixture({ setting: "gone/model" });
    expect((await g.manager.listModels({ sessionId: "root", callId: "m" })).text.split("\n")[0]).toBe(
      "Default subagent model: follows your current model (conn/fast)",
    );
    await g.settled(idOf(await g.spawn()));
    expect(g.turns.at(-1)).toMatchObject({ model: "conn/fast", thinkingEnabled: false });
    await g.close();
  });

  it("keeps the approval text a subagent reports", () => {
    expect(SUBAGENT_APPROVAL_UNAVAILABLE).toBe(
      "This action needs the user's approval, which a subagent cannot request. Report what you need to your parent instead.",
    );
  });
});

// S4：agent_fork 复制父会话到当前轮最后一个完整步骤，补 turn/end，按主会话方式组装并沿用父会话的模型。
describe("SubagentManager forks", () => {
  const core = (type: string, data: Record<string, unknown>) =>
    ({ type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null }) as never;
  /** The parent is in its third step of a Plan-mode Turn, calling `agent_fork`; a subagent notice waits in its inbox. */
  async function parentMidTurn(root: SessionHandle): Promise<number> {
    await root.append(core("turn/start", { turnId: "t1", agentRunId: "run", mode: "plan" }));
    await root.append(core("user/message", { messageId: "u1", agentRunId: "run" }));
    let boundary = -1;
    for (const step of ["s1", "s2"]) {
      await root.append(core("step/start", { turnId: "t1", stepId: step, agentRunId: "run" }));
      await root.append(
        core("tool/call", {
          turnId: "t1",
          stepId: step,
          agentRunId: "run",
          callId: `read-${step}`,
          name: "read_file",
          args: {},
        }),
      );
      await root.append(
        core("tool/result", { callId: `read-${step}`, name: "read_file", status: "completed", agentRunId: "run" }),
      );
      boundary = (
        await root.append(core("step/end", { turnId: "t1", stepId: step, agentRunId: "run", status: "completed" }))
      ).seq;
    }
    await new MainAgentInbox(root).enqueue(
      "<subagent_notification />",
      { taskId: "x", kind: "subagent", title: "x", status: "completed" },
      { source: "subagent_notification" },
    );
    await root.append(core("step/start", { turnId: "t1", stepId: "s3", agentRunId: "run" }));
    await root.append(
      core("tool/call", {
        turnId: "t1",
        stepId: "s3",
        agentRunId: "run",
        callId: "fork-call",
        name: "agent_fork",
        args: {},
      }),
    );
    return boundary;
  }
  const TOOLS = ["read_file", "write_file", "bash", "agent", "agent_fork", "task_output", "task_stop", "send_message"];
  const fork = (
    f: Awaited<ReturnType<typeof fixture>>,
    input: { sessionId?: string; callId?: string; model?: string; reasoningEffort?: string; background?: boolean } = {},
  ) =>
    f.manager.spawnFork({
      sessionId: input.sessionId ?? "root",
      callId: input.callId ?? "fork-call",
      ...(input.sessionId ? {} : { scope: f.rootScope }),
      description: "try plan B",
      prompt: "Try the other approach.",
      background: input.background ?? true,
      ...(input.model ? { model: input.model } : {}),
      ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
      parentToolNames: TOOLS,
      signal: new AbortController().signal,
    });

  it("copies the parent up to its last completed step, closes the copied Turn and runs like the main agent", async () => {
    const f = await fixture({
      setting: "conn/deep",
      parent: { model: "conn/fast", thinkingEnabled: false, selectedSkillIds: ["skill-a"] },
    });
    const boundary = await parentMidTurn(f.root);
    const started = await fork(f);
    const agentId = idOf(started);
    const transcriptPath = `/data/sessions-v2/${agentId}/transcript.md`;
    expect(started.text.split("\n")[0]).toBe(`Started forked subagent ${agentId} (try plan B) in the background.`);
    expect(started.ok && started.detail).toEqual([
      {
        label: "actspace.context.trace",
        value: { kind: "trace", path: transcriptPath, description: "Subagent transcript: try plan B" },
      },
      {
        label: "delegation",
        value: {
          childSessionId: agentId,
          agentId,
          kind: "fork",
          description: "try plan B",
          transcriptPath,
          background: true,
          inheritedThroughSeq: boundary,
          status: "running",
        },
      },
    ]);
    const child = f.live.get(agentId)!;
    expect(child.header.lineage).toEqual({
      parentSessionId: "root",
      parentBoundarySeq: boundary,
      origin: "delegation",
      delegationDepth: 1,
      inheritedThroughSeq: boundary,
      parentCallId: "fork-call",
    });
    expect(child.header.createdWith).toMatchObject({ presetId: FORKED_SUBAGENT_PRESET_ID, manifestDigest: "manifest" });
    // The copy keeps seqs; the fork closes the parent's Turn and drops the parent's queued notice.
    const events = child.journal.readEvents();
    expect(events.slice(0, boundary + 1).map((event) => [event.seq, event.type])).toEqual(
      f.root.journal
        .readEvents()
        .slice(0, boundary + 1)
        .map((event) => [event.seq, event.type]),
    );
    expect(events[boundary + 1]).toMatchObject({ type: "turn/end", data: { turnId: "t1", reason: "forked" } });
    expect(
      events.some((event) => event.type === "tool/call" && (event.data as { callId?: string }).callId === "fork-call"),
    ).toBe(false);
    expect(new MainAgentInbox(child).pending()).toEqual([]);
    // The parent's own notice is still its own.
    expect(new MainAgentInbox(f.root).pending()).toHaveLength(1);
    // Same tools as the parent, same model (the default subagent setting is ignored), the Turn's mode and the selected skills.
    expect(f.loops[0]).toMatchObject({ agentId, role: "fork", allowedToolNames: [...TOOLS].sort() });
    expect(f.loops[0]).not.toHaveProperty("preset");
    expect(f.turns[0]).toEqual(
      expect.objectContaining({
        content: `Try the other approach.\n\n${taskGuidance(transcriptPath, "fork")}`,
        model: "conn/fast",
        thinkingEnabled: false,
        mode: "plan",
        selectedSkillIds: ["skill-a"],
      }),
    );
    expect(f.backgroundTasks.get("root", agentId)).toMatchObject({
      kind: "agent",
      agent: { transcriptPath, label: "fork" },
    });
    const view = await f.settled(agentId);
    expect(view).toMatchObject({
      kind: "fork",
      inheritedThroughSeq: boundary,
      toolNames: [...TOOLS].sort(),
      status: "closed",
      activations: [{ trigger: "spawn", model: "conn/fast", settle: { status: "completed", delivery: "notified" } }],
    });
    expect(view.preset).toBeUndefined();
    expect(f.root.journal.events.find((event) => event.type === "subagent/spawned")?.data).not.toHaveProperty("preset");
    await f.close();
  });

  it("takes a requested model, refuses forks from subagents and calls outside a step", async () => {
    const hold = gate();
    const f = await fixture({
      script: async () => {
        await hold.promise;
        return { reason: "completed", finalText: "B works." };
      },
    });
    await parentMidTurn(f.root);
    const running = idOf(await fork(f));
    await until(() => f.live.has(running) && f.turns.length === 1);
    expect(await fork(f, { sessionId: running })).toEqual({
      ok: false,
      code: "SUBAGENT_BLOCKED",
      text: "Subagents cannot use agent_fork.",
    });
    hold.open();
    await f.settled(running);
    const started = await fork(f, { model: "conn/deep", reasoningEffort: "high", background: false });
    expect(started).toMatchObject({ ok: true });
    expect(started.text.split("\n")[0]).toMatch(/^Subagent [0-9a-f-]{36} \(try plan B\) finished\.$/);
    expect(started.text).toContain("B works.");
    expect(f.turns.at(-1)).toMatchObject({
      model: "conn/deep",
      reasoningEffort: "high",
      thinkingEnabled: true,
      mode: "plan",
    });
    expect(await fork(f, { callId: "missing" })).toMatchObject({ ok: false, code: "FORK_UNAVAILABLE" });
    expect(await fork(f, { model: "conn/none" })).toMatchObject({ ok: false, code: "UNKNOWN_MODEL" });
    await f.close();
  });
});

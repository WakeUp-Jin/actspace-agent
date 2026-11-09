import { JsonlSessionStorage } from "@actspace/session-persistence-jsonl";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MainAgentInbox } from "@actspace/agent";
import { AgentScope } from "@actspace/scope";
import { createCoreCodecRegistry, FORKED_SUBAGENT_PRESET_ID } from "@actspace/session-journal";
import { SessionStore, type SessionHandle } from "@actspace/session-persistence";
import type { UsableModelSummary } from "@actspace/shared";
import { SubagentManager, subagentTree, type ChildLoop, type ChildLoopInput, type ParentConfiguration } from "../manager.js";
import { SUBAGENT_APPROVAL_UNAVAILABLE, taskGuidance } from "../messages.js";
import type { SubagentToolOutcome } from "../types.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

type TurnInput = { readonly content: unknown; readonly wake?: boolean; readonly model?: string; readonly reasoningEffort?: string; readonly thinkingEnabled?: boolean; readonly mode?: string; readonly selectedSkillIds?: readonly string[] };
type TurnContext = { readonly session: SessionHandle; readonly input: TurnInput; readonly claimed: readonly unknown[]; readonly signal: AbortSignal; readonly loop: ChildLoopInput; readonly turn: number };
type TurnScript = (context: TurnContext) => Promise<{ readonly reason: string; readonly steps?: number; readonly finalText?: string }>;

const MODELS: UsableModelSummary[] = [
  { key: "conn/fast", label: "Fast", connectionLabel: "Relay", reasoningEfforts: [], thinkingDefault: false },
  { key: "conn/deep", label: "Deep", connectionLabel: "Relay", reasoningEfforts: ["low", "medium", "high"], defaultEffort: "medium", thinkingDefault: true },
];

async function fixture(options: { script?: TurnScript; syncWaitMs?: number; setting?: string | null; dataRoot?: string; parent?: ParentConfiguration } = {}) {
  const dataRoot = options.dataRoot ?? await mkdtemp(join(tmpdir(), "actspace-subagent-")); if (!options.dataRoot) roots.push(dataRoot);
  const registry = createCoreCodecRegistry();
  const store = new SessionStore({ registry }, new JsonlSessionStorage({ dataRoot, runtimeId: "runtime", registry }));
  const live = new Map<string, SessionHandle>();
  const root = options.dataRoot ? await store.open("root") : await store.create({ sessionId: "root", createdAt: "2026-11-03T10:00:00.000Z", lineage: null, createdWith: { profileId: "base", runtimeContractVersion: "2", manifestDigest: "manifest", plugins: [{ id: "@actspace/core", version: "2" }], codecSetDigest: registry.digest } });
  live.set("root", root);
  const rootScope = new AgentScope("main:root");
  const refreshed: string[] = [], woken: string[] = [], turns: TurnInput[] = [], loops: ChildLoopInput[] = [], finished: string[] = [];
  let script: TurnScript = options.script ?? (async () => ({ reason: "completed", steps: 1, finalText: "done" }));
  let rootRunning = false;
  const manager = new SubagentManager({
    store, manifestDigest: "manifest", plugins: [{ id: "@actspace/core", version: "2" }],
    openSession: async id => live.get(id) ?? store.open(id),
    getOpenSession: id => live.get(id),
    acquireRun: async ({ scope }) => {
      const leaseScope = scope.child(`lease-${loops.length}`);
      let session: SessionHandle | undefined;
      return {
        scope: leaseScope,
        start: async (child, content) => {
          session = child;
          const messageId = `m-${Math.random().toString(16).slice(2)}`;
          // Like TaskLedger: a wake task opens with the claimed inbox items, not a user message.
          if (content && typeof content === "object" && "kind" in content && content.kind === "background-wake") return { messageId };
          await child.append({ type: "user/message", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { messageId, content }, surface: null } as never);
          return { messageId };
        },
        createLoop: async input => {
          loops.push(input);
          live.set(input.session.header.sessionId, input.session);
          let turn = 0;
          const loop: ChildLoop = {
            runTurn: (async (turnInput: TurnInput) => {
              turns.push(turnInput);
              const inbox = new MainAgentInbox(input.session);
              if (turnInput.wake && !inbox.hasPendingNotifications()) return { reason: "completed", steps: 0, finalText: "" };
              const claimed = (await inbox.claim()).map(item => item.content);
              const result = await script({ session: input.session, input: turnInput, claimed, signal: input.signal, loop: input, turn: turn++ });
              return { steps: 1, finalText: "", ...result };
            }) as never,
            abort: () => undefined,
            waitForIdle: async () => undefined,
            quiesce: () => undefined,
          };
          return loop;
        },
        finish: async outcome => { finished.push(outcome); },
        release: async () => { if (session) live.delete(session.header.sessionId); await leaseScope.dispose(); },
      };
    },
    transcriptPath: id => `/data/sessions-v2/${id}/transcript.md`,
    refreshTranscript: async id => { refreshed.push(id); },
    models: () => ({ listUsableModels: () => MODELS, subagentDefaultModel: () => options.setting ?? null }),
    parentConfiguration: () => options.parent ?? { model: "conn/fast", thinkingEnabled: false },
    permissionMode: () => "full-access",
    isSessionRunning: id => id === "root" ? rootRunning : false,
    hasQueuedInput: () => false,
    wake: id => { woken.push(id); },
    onError: error => { throw error; },
    now: () => new Date("2026-11-03T10:30:00.000Z"),
    ...(options.syncWaitMs === undefined ? {} : { syncWaitMs: options.syncWaitMs }),
    pollMs: 5,
  });
  const spawn = (input: { description?: string; prompt?: string; background?: boolean; preset?: "general" | "explore"; model?: string; reasoningEffort?: string; signal?: AbortSignal } = {}) => manager.spawn({
    sessionId: "root", callId: `call-${Math.random().toString(16).slice(2)}`, scope: rootScope,
    description: input.description ?? "review auth", prompt: input.prompt ?? "Review the auth module.", preset: input.preset ?? "general", background: input.background ?? true,
    ...(input.model ? { model: input.model } : {}), ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
    parentToolNames: ["read_file", "write_file", "bash", "agent", "task_output", "send_message", "list_agents", "wait_agent"],
    registeredToolNames: ["read_file", "write_file", "bash", "grep", "glob", "list_directory", "agent", "task_output", "send_message", "list_agents", "wait_agent"],
    signal: input.signal ?? new AbortController().signal,
  });
  const settled = async (agentId: string, count = 1) => {
    await until(() => (subagentTree(root).agents[agentId]?.activations.filter(item => item.settle).length ?? 0) >= count && !manager.runningCount("root"));
    return subagentTree(root).agents[agentId];
  };
  const close = async () => { await manager.dispose(); for (const session of live.values()) await session.close().catch(() => undefined); await rootScope.dispose(); await store.storage.close(); };
  return { dataRoot, store, root, live, manager, rootScope, refreshed, woken, turns, loops, finished, spawn, settled, close, setScript: (next: TurnScript) => { script = next; }, setRootRunning: (value: boolean) => { rootRunning = value; } };
}

async function until(check: () => boolean, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) { if (Date.now() > deadline) throw new Error("timed out"); await new Promise(resolve => setTimeout(resolve, 5)); }
}
function idOf(outcome: SubagentToolOutcome): string { return /subagent ([0-9a-f-]{36})/i.exec(outcome.text)![1]; }
function gate() { let open!: () => void; const promise = new Promise<void>(resolve => { open = resolve; }); return { promise, open }; }
function pendingTexts(session: SessionHandle): string[] { return new MainAgentInbox(session).pending().map(item => String(item.content)); }

describe("SubagentManager", () => {
  it("starts a background subagent, records it and notifies the parent when it finishes", async () => {
    const hold = gate();
    const f = await fixture({ script: async () => { await hold.promise; return { reason: "completed", finalText: "Auth looks fine." }; } });
    const started = await f.spawn();
    expect(started.ok).toBe(true);
    const agentId = idOf(started);
    expect(started.text).toBe([
      `Started subagent ${agentId} (review auth) in the background.`,
      `transcript: /data/sessions-v2/${agentId}/transcript.md`,
      "You will be notified when it finishes. Use send_message to add instructions; do not wait for it unless you have nothing else to do.",
    ].join("\n"));
    expect(started.ok && started.detail).toEqual([
      { label: "actspace.context.trace", value: { kind: "trace", path: `/data/sessions-v2/${agentId}/transcript.md`, description: "Subagent transcript: review auth" } },
      { label: "delegation", value: { childSessionId: agentId, agentId, kind: "local", preset: "general", description: "review auth", transcriptPath: `/data/sessions-v2/${agentId}/transcript.md`, background: true, status: "running" } },
    ]);
    // The transcript was written with the task before the path went out.
    expect(f.refreshed).toContain(agentId);
    const child = f.live.get(agentId)!;
    expect(child.header.lineage).toMatchObject({ parentSessionId: "root", origin: "delegation", delegationDepth: 1 });
    expect(child.journal.events.find(event => event.type === "permission/mode-set")?.data).toMatchObject({ mode: "full-access", source: "parent" });
    expect(f.turns[0]).toMatchObject({ content: `Review the auth module.\n\n${taskGuidance(`/data/sessions-v2/${agentId}/transcript.md`, "general")}`, model: "conn/fast", thinkingEnabled: false });
    expect(f.loops[0]).toMatchObject({ agentId, preset: "general", maxSteps: 1000, allowedToolNames: ["bash", "list_agents", "read_file", "send_message", "wait_agent", "write_file"] });
    expect(subagentTree(f.root).agents[agentId]).toMatchObject({ status: "running", toolNames: ["bash", "list_agents", "read_file", "send_message", "wait_agent", "write_file"] });
    expect(f.manager.running("root")).toEqual([{ agentId, description: "review auth", label: "general", startedAt: "2026-11-03T10:30:00.000Z", transcriptPath: `/data/sessions-v2/${agentId}/transcript.md` }]);
    expect(f.manager.running(agentId)).toEqual([]);
    hold.open();
    const view = await f.settled(agentId);
    expect(f.manager.running("root")).toEqual([]);
    expect(view).toMatchObject({ status: "inactive", activations: [{ trigger: "spawn", background: true, model: "conn/fast", settle: { status: "completed", delivery: "notified", result: "Auth looks fine." } }] });
    expect(pendingTexts(f.root)).toEqual([[
      "<subagent_notification>", `<agent_id>${agentId}</agent_id>`, "<description>review auth</description>", "<status>completed</status>",
      `<summary>Subagent ${agentId} finished and will do no further work unless you send it more.</summary>`, `<transcript>/data/sessions-v2/${agentId}/transcript.md</transcript>`,
      "<closing_message>", "Auth looks fine.", "</closing_message>", "</subagent_notification>",
    ].join("\n")]);
    expect(new MainAgentInbox(f.root).pending()[0]).toMatchObject({ source: "subagent_notification", notice: { taskId: agentId, kind: "subagent", title: "review auth", status: "completed" } });
    expect(f.woken).toEqual(["root"]);
    expect(f.finished).toEqual(["completed"]);
    expect(f.live.has(agentId)).toBe(false);
    await f.close();
  });

  it("returns a synchronous result and moves a long synchronous call to the background", async () => {
    const f = await fixture({ syncWaitMs: 30 });
    const done = await f.spawn({ background: false });
    const first = idOf(done);
    expect(done.text).toBe(`Subagent ${first} (review auth) finished.\ntranscript: /data/sessions-v2/${first}/transcript.md\n\ndone`);
    expect(subagentTree(f.root).agents[first].activations[0].settle).toMatchObject({ delivery: "returned" });
    expect(pendingTexts(f.root)).toEqual([]);

    const hold = gate();
    f.setScript(async () => { await hold.promise; return { reason: "completed", finalText: "late" }; });
    const moved = await f.spawn({ background: false, description: "slow job" });
    const second = idOf(moved);
    expect(moved.text.split("\n")[0]).toBe(`Subagent ${second} (slow job) is still running and has moved to the background (30 minute wait limit).`);
    hold.open();
    await f.settled(second);
    expect(subagentTree(f.root).agents[second].activations[0].settle).toMatchObject({ delivery: "notified" });
    expect(pendingTexts(f.root)[0]).toContain("<closing_message>\nlate\n</closing_message>");
    await f.close();
  });

  it("stops a synchronous subagent when the parent's call is cancelled", async () => {
    const f = await fixture({ script: async ({ signal }) => { await new Promise(resolve => signal.addEventListener("abort", resolve, { once: true })); return { reason: "aborted" }; } });
    const parent = new AbortController();
    const pending = f.spawn({ background: false, signal: parent.signal });
    await until(() => f.turns.length === 1);
    parent.abort();
    const result = await pending;
    expect(result.text.split("\n")[0]).toMatch(/was stopped before it finished\.$/);
    await f.close();
  });

  it("continues an inactive subagent with send_message and labels the sender", async () => {
    const f = await fixture();
    const agentId = idOf(await f.spawn());
    await f.settled(agentId);
    const claimed: unknown[][] = [];
    f.setScript(async ({ claimed: items }) => { claimed.push([...items]); return { reason: "completed", finalText: "second answer" }; });
    const sent = await f.manager.sendMessage({ sessionId: "root", callId: "c2", scope: f.rootScope, agentId, message: "Also check the session cookies." });
    expect(sent).toEqual({ ok: true, text: `Message delivered to ${agentId} (it was inactive and has started working on it).` });
    const view = await f.settled(agentId, 2);
    expect(view.activations[1]).toMatchObject({ trigger: "message", senderId: "root", background: true, model: "conn/fast", settle: { status: "completed", result: "second answer" } });
    expect(claimed).toEqual([[`<agent_message from="root" relation="parent">\nAlso check the session cookies.\n</agent_message>`]]);
    expect(f.turns.at(-1)).toMatchObject({ wake: true, content: "" });
    await f.close();
  });

  it("steers a running subagent and turns a message that arrives after its last step into another turn", async () => {
    const hold = gate();
    const seen: unknown[][] = [];
    const f = await fixture({ script: async ({ claimed, turn }) => { seen.push([...claimed]); if (turn === 0) await hold.promise; return { reason: "completed", finalText: `turn ${turn}` }; } });
    const agentId = idOf(await f.spawn());
    await until(() => seen.length === 1);
    // The first Turn already took its last step: the message waits in the inbox until settlement checks it.
    const sent = await f.manager.sendMessage({ sessionId: "root", callId: "c2", scope: f.rootScope, agentId, message: "One more thing." });
    expect(sent.text).toBe(`Message delivered to ${agentId} (running; it will see it at its next step).`);
    hold.open();
    const view = await f.settled(agentId);
    expect(view.activations).toHaveLength(1);
    expect(seen[1]).toEqual([`<agent_message from="root" relation="parent">\nOne more thing.\n</agent_message>`]);
    expect(view.activations[0].settle).toMatchObject({ result: "turn 1" });
    await f.close();
  });

  it("interrupts a running subagent, which can be continued afterwards", async () => {
    const f = await fixture({ script: async ({ signal }) => { await new Promise(resolve => signal.addEventListener("abort", resolve, { once: true })); return { reason: "aborted", finalText: "partial" }; } });
    const agentId = idOf(await f.spawn());
    await until(() => f.turns.length === 1);
    expect(await f.manager.interrupt({ sessionId: "root", callId: "i", agentId })).toEqual({ ok: true, text: `Stopping subagent ${agentId}. You will be notified when it stops.` });
    const view = await f.settled(agentId);
    expect(view.activations[0].settle).toMatchObject({ status: "interrupted" });
    expect(f.finished).toEqual(["cancelled"]);
    expect(pendingTexts(f.root)[0]).toContain(`<summary>Subagent ${agentId} was stopped before it finished. Send it a message to continue.</summary>`);
    expect(await f.manager.interrupt({ sessionId: "root", callId: "i2", agentId })).toEqual({ ok: true, text: `Subagent ${agentId} is not running.` });
    f.setScript(async () => ({ reason: "completed", finalText: "resumed" }));
    await f.manager.sendMessage({ sessionId: "root", callId: "c", scope: f.rootScope, agentId, message: "Continue." });
    expect((await f.settled(agentId, 2)).activations[1].settle).toMatchObject({ status: "completed", result: "resumed" });
    await f.close();
  });

  it("stops every running subagent of a rewinding Session without notifying or waking it", async () => {
    const f = await fixture({ syncWaitMs: 60_000, script: async ({ signal }) => { await new Promise(resolve => signal.addEventListener("abort", resolve, { once: true })); return { reason: "aborted", finalText: "partial" }; } });
    const background = idOf(await f.spawn());
    const sync = f.spawn({ background: false, description: "sync job" });
    await until(() => f.turns.length === 2);
    await f.manager.stopAll("root");
    expect(f.manager.runningCount("root")).toBe(0);
    const tree = subagentTree(f.root);
    expect(tree.agents[background].activations[0].settle).toMatchObject({ status: "interrupted", delivery: "lost" });
    const syncId = Object.keys(tree.agents).find(id => id !== background)!;
    expect(tree.agents[syncId].activations[0].settle).toMatchObject({ status: "interrupted", delivery: "lost" });
    // The synchronous caller still gets its answer: the tool call is closed, not left hanging.
    expect((await sync).text.split("\n")[0]).toMatch(/was stopped before it finished\.$/);
    expect(pendingTexts(f.root)).toEqual([]);
    expect(f.woken).toEqual([]);
    await f.close();
  });

  it("records an activation cut off by an exit as lost and continues it after restart", async () => {
    const first = await fixture({ script: async ({ signal }) => { await new Promise(resolve => signal.addEventListener("abort", resolve, { once: true })); return { reason: "aborted" }; } });
    const agentId = idOf(await first.spawn());
    await until(() => first.turns.length === 1);
    await first.root.flush();
    await first.manager.dispose();
    // Shutdown does not settle: the next start reports it.
    expect(subagentTree(first.root).agents[agentId].activations[0].settle).toBeUndefined();
    await first.close();

    const second = await fixture({ dataRoot: first.dataRoot, script: async () => ({ reason: "completed", finalText: "picked up" }) });
    await second.manager.recoverLost(second.root);
    const lost = subagentTree(second.root).agents[agentId];
    expect(lost).toMatchObject({ status: "inactive", activations: [{ settle: { status: "lost", delivery: "lost" } }] });
    expect(pendingTexts(second.root)).toEqual([[
      "<subagent_notification>", `<agent_id>${agentId}</agent_id>`, "<description>review auth</description>", "<status>lost</status>",
      `<summary>Subagent ${agentId} (review auth) was interrupted because the app exited. Its transcript shows how far it got. Send it a message with send_message to continue it.</summary>`,
      `<transcript>/data/sessions-v2/${agentId}/transcript.md</transcript>`, "</subagent_notification>",
    ].join("\n")]);
    await second.manager.recoverLost(second.root);
    expect(subagentTree(second.root).agents[agentId].activations).toHaveLength(1);
    await second.manager.sendMessage({ sessionId: "root", callId: "c", scope: second.rootScope, agentId, message: "Continue." });
    expect((await second.settled(agentId, 2)).activations[1].settle).toMatchObject({ status: "completed", result: "picked up" });
    await second.close();
  });

  it("refuses an eleventh running subagent", async () => {
    const hold = gate();
    const f = await fixture({ script: async () => { await hold.promise; return { reason: "completed" }; } });
    for (let index = 0; index < 10; index += 1) expect((await f.spawn()).ok).toBe(true);
    expect(await f.spawn()).toEqual({ ok: false, code: "SUBAGENT_LIMIT", text: "10 subagents are already running. Wait for one to finish or interrupt one." });
    hold.open();
    await until(() => f.manager.runningCount("root") === 0);
    await f.close();
  });

  it("lets a subagent message its parent and its siblings, and keeps its own tools from delegating", async () => {
    const hold = gate();
    const f = await fixture({ script: async () => { await hold.promise; return { reason: "completed" }; } });
    const a = idOf(await f.spawn({ description: "a" }));
    const b = idOf(await f.spawn({ description: "b" }));
    await until(() => f.live.has(a) && f.live.has(b) && f.turns.length === 2);
    expect(await f.manager.sendMessage({ sessionId: a, callId: "s1", agentId: b, message: "I own auth.ts." })).toEqual({ ok: true, text: `Message delivered to ${b} (running; it will see it at its next step).` });
    expect(pendingTexts(f.live.get(b)!)).toEqual([`<agent_message from="${a}" relation="sibling">\nI own auth.ts.\n</agent_message>`]);
    expect(await f.manager.sendMessage({ sessionId: a, callId: "s2", agentId: "root", message: "Halfway done." })).toEqual({ ok: true, text: "Message delivered to root (it was inactive and has started working on it)." });
    expect(new MainAgentInbox(f.root).pending()[0]).toMatchObject({ source: "agent_message", senderId: a, content: `<agent_message from="${a}" relation="child">\nHalfway done.\n</agent_message>`, notice: { taskId: a, kind: "agent_message", title: "a", status: "message" } });
    expect(f.woken).toEqual(["root"]);
    expect(await f.manager.sendMessage({ sessionId: a, callId: "s3", agentId: a, message: "x" })).toEqual({ ok: false, code: "INVALID_TARGET", text: "You cannot send a message to yourself." });
    expect(await f.manager.sendMessage({ sessionId: "root", callId: "s4", agentId: "nope", message: "x" })).toMatchObject({ ok: false, text: "Unknown agent nope. Call list_agents to see your subagent tree." });
    expect(await f.manager.spawn({ sessionId: a, callId: "s5", description: "x", prompt: "x", preset: "general", background: true, parentToolNames: [], registeredToolNames: [], signal: new AbortController().signal })).toEqual({ ok: false, code: "SUBAGENT_BLOCKED", text: "Subagents cannot use agent." });
    const listed = await f.manager.listAgents({ sessionId: a, callId: "l" });
    expect(listed.text.split("\n")).toEqual([
      "root [inactive] (parent)",
      `${a} [running] (you) general · conn/fast · started ${localClock()} — a`, `  transcript: /data/sessions-v2/${a}/transcript.md`,
      `${b} [running] general · conn/fast · started ${localClock()} — b`, `  transcript: /data/sessions-v2/${b}/transcript.md`,
    ]);
    hold.open();
    await until(() => f.manager.runningCount("root") === 0);
    expect((await f.manager.listAgents({ sessionId: "root", callId: "l2" })).text.split("\n")).toEqual([
      "root [inactive] (you)",
      `${a} [inactive] general · 1 turn — a`, `  transcript: /data/sessions-v2/${a}/transcript.md`,
      `${b} [inactive] general · 1 turn — b`, `  transcript: /data/sessions-v2/${b}/transcript.md`,
    ]);
    await f.close();
  });

  it("omits the closing message when the subagent's last action was a message to its parent", async () => {
    const f = await fixture({ script: async ({ session }) => {
      const append = (type: string, data: Record<string, unknown>) => session.append({ type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null } as never);
      await append("turn/start", { turnId: "turn", agentRunId: "run" });
      await append("step/start", { turnId: "turn", stepId: "step", agentRunId: "run", stepIndex: 1 });
      await append("tool/call", { turnId: "turn", stepId: "step", callId: "t1", name: "send_message", args: { agent_id: "root", message: "Result: ok" } });
      await append("step/end", { turnId: "turn", stepId: "step" });
      await append("turn/end", { turnId: "turn", reason: "completed" });
      return { reason: "completed", finalText: "Sent." };
    } });
    const agentId = idOf(await f.spawn());
    await f.settled(agentId);
    expect(pendingTexts(f.root)[0]).toContain("<note>It sent you a message just before finishing, so its closing message is omitted.</note>");
    await f.close();
  });

  it("chooses models from the request, the setting or the parent, and lists them", async () => {
    const f = await fixture({ setting: "conn/deep" });
    expect(await f.spawn({ model: "nope" })).toEqual({ ok: false, code: "UNKNOWN_MODEL", text: "Unknown model nope. Call list_subagent_models to see the available models." });
    expect(await f.spawn({ model: "conn/deep", reasoningEffort: "max" })).toEqual({ ok: false, code: "UNKNOWN_EFFORT", text: "Unknown reasoning effort max for conn/deep. Call list_subagent_models to see the available efforts." });
    await f.settled(idOf(await f.spawn()));
    expect(f.turns.at(-1)).toMatchObject({ model: "conn/deep", thinkingEnabled: true, reasoningEffort: "medium" });
    await f.settled(idOf(await f.spawn({ model: "conn/fast" })));
    expect(f.turns.at(-1)).toMatchObject({ model: "conn/fast", thinkingEnabled: false });
    expect((await f.manager.listModels({ sessionId: "root", callId: "m" })).text).toBe([
      "Default subagent model: conn/deep",
      "- conn/fast — Fast · Relay",
      "- conn/deep — Deep · Relay · efforts: low, medium, high (default medium)",
    ].join("\n"));
    await f.close();
    const g = await fixture({ setting: "gone/model" });
    expect((await g.manager.listModels({ sessionId: "root", callId: "m" })).text.split("\n")[0]).toBe("Default subagent model: follows your current model (conn/fast)");
    await g.settled(idOf(await g.spawn()));
    expect(g.turns.at(-1)).toMatchObject({ model: "conn/fast", thinkingEnabled: false });
    await g.close();
  });

  it("waits for new input and times out", async () => {
    const f = await fixture();
    expect(await f.manager.waitForInput({ sessionId: "root", callId: "w", timeoutMs: 20, signal: new AbortController().signal })).toEqual({ ok: true, text: "Timed out after 0s with no new input." });
    const waiting = f.manager.waitForInput({ sessionId: "root", callId: "w2", timeoutMs: 5000, signal: new AbortController().signal });
    await new MainAgentInbox(f.root).enqueue("note", undefined, { source: "subagent_notification" });
    expect(await waiting).toEqual({ ok: true, text: "Input arrived." });
    await f.close();
  });

  it("keeps the approval text a subagent reports", () => {
    expect(SUBAGENT_APPROVAL_UNAVAILABLE).toBe("This action needs the user's approval, which a subagent cannot request. Report what you need to your parent instead.");
  });
});

// S4：agent_fork 复制父会话到当前轮最后一个完整步骤，补 turn/end，按主会话方式组装并沿用父会话的模型。
describe("SubagentManager forks", () => {
  const core = (type: string, data: Record<string, unknown>) => ({ type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null }) as never;
  /** The parent is in its third step of a Plan-mode Turn, calling `agent_fork`; a subagent notice waits in its inbox. */
  async function parentMidTurn(root: SessionHandle): Promise<number> {
    await root.append(core("turn/start", { turnId: "t1", agentRunId: "run", mode: "plan" }));
    await root.append(core("user/message", { messageId: "u1", agentRunId: "run" }));
    let boundary = -1;
    for (const step of ["s1", "s2"]) {
      await root.append(core("step/start", { turnId: "t1", stepId: step, agentRunId: "run" }));
      await root.append(core("tool/call", { turnId: "t1", stepId: step, agentRunId: "run", callId: `read-${step}`, name: "read_file", args: {} }));
      await root.append(core("tool/result", { callId: `read-${step}`, name: "read_file", status: "completed", agentRunId: "run" }));
      boundary = (await root.append(core("step/end", { turnId: "t1", stepId: step, agentRunId: "run", status: "completed" }))).seq;
    }
    await new MainAgentInbox(root).enqueue("<subagent_notification />", { taskId: "x", kind: "subagent", title: "x", status: "completed" }, { source: "subagent_notification" });
    await root.append(core("step/start", { turnId: "t1", stepId: "s3", agentRunId: "run" }));
    await root.append(core("tool/call", { turnId: "t1", stepId: "s3", agentRunId: "run", callId: "fork-call", name: "agent_fork", args: {} }));
    return boundary;
  }
  const TOOLS = ["read_file", "write_file", "bash", "agent", "agent_fork", "task_output", "send_message", "list_agents", "wait_agent", "interrupt_agent"];
  const fork = (f: Awaited<ReturnType<typeof fixture>>, input: { sessionId?: string; callId?: string; model?: string; reasoningEffort?: string; background?: boolean } = {}) => f.manager.spawnFork({
    sessionId: input.sessionId ?? "root", callId: input.callId ?? "fork-call", ...(input.sessionId ? {} : { scope: f.rootScope }),
    description: "try plan B", prompt: "Try the other approach.", background: input.background ?? true,
    ...(input.model ? { model: input.model } : {}), ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
    parentToolNames: TOOLS, signal: new AbortController().signal,
  });

  it("copies the parent up to its last completed step, closes the copied Turn and runs like the main agent", async () => {
    const f = await fixture({ setting: "conn/deep", parent: { model: "conn/fast", thinkingEnabled: false, selectedSkillIds: ["skill-a"] } });
    const boundary = await parentMidTurn(f.root);
    const started = await fork(f);
    const agentId = idOf(started);
    const transcriptPath = `/data/sessions-v2/${agentId}/transcript.md`;
    expect(started.text.split("\n")[0]).toBe(`Started forked subagent ${agentId} (try plan B) in the background.`);
    expect(started.ok && started.detail).toEqual([
      { label: "actspace.context.trace", value: { kind: "trace", path: transcriptPath, description: "Subagent transcript: try plan B" } },
      { label: "delegation", value: { childSessionId: agentId, agentId, kind: "fork", description: "try plan B", transcriptPath, background: true, inheritedThroughSeq: boundary, status: "running" } },
    ]);
    const child = f.live.get(agentId)!;
    expect(child.header.lineage).toEqual({ parentSessionId: "root", parentBoundarySeq: boundary, origin: "delegation", delegationDepth: 1, inheritedThroughSeq: boundary, parentCallId: "fork-call" });
    expect(child.header.createdWith).toMatchObject({ presetId: FORKED_SUBAGENT_PRESET_ID, manifestDigest: "manifest" });
    // The copy keeps seqs; the fork closes the parent's Turn and drops the parent's queued notice.
    const events = child.journal.readEvents();
    expect(events.slice(0, boundary + 1).map(event => [event.seq, event.type])).toEqual(f.root.journal.readEvents().slice(0, boundary + 1).map(event => [event.seq, event.type]));
    expect(events[boundary + 1]).toMatchObject({ type: "turn/end", data: { turnId: "t1", reason: "forked" } });
    expect(events.some(event => event.type === "tool/call" && (event.data as { callId?: string }).callId === "fork-call")).toBe(false);
    expect(new MainAgentInbox(child).pending()).toEqual([]);
    // The parent's own notice is still its own.
    expect(new MainAgentInbox(f.root).pending()).toHaveLength(1);
    // Same tools as the parent, same model (the default subagent setting is ignored), the Turn's mode and the selected skills.
    expect(f.loops[0]).toMatchObject({ agentId, role: "fork", allowedToolNames: [...TOOLS].sort() });
    expect(f.loops[0]).not.toHaveProperty("preset");
    expect(f.turns[0]).toEqual(expect.objectContaining({ content: `Try the other approach.\n\n${taskGuidance(transcriptPath, "fork")}`, model: "conn/fast", thinkingEnabled: false, mode: "plan", selectedSkillIds: ["skill-a"] }));
    const view = await f.settled(agentId);
    expect(view).toMatchObject({ kind: "fork", inheritedThroughSeq: boundary, toolNames: [...TOOLS].sort(), status: "inactive", activations: [{ trigger: "spawn", model: "conn/fast", settle: { status: "completed", delivery: "notified" } }] });
    expect(view.preset).toBeUndefined();
    expect(f.root.journal.events.find(event => event.type === "subagent/spawned")?.data).not.toHaveProperty("preset");
    expect((await f.manager.listAgents({ sessionId: "root", callId: "l" })).text).toContain(`${agentId} [inactive] fork · 1 turn — try plan B`);

    // A continuation stays a fork in the same mode, without the first Turn's skills.
    await f.manager.sendMessage({ sessionId: "root", callId: "c2", scope: f.rootScope, agentId, message: "Now compare both." });
    await f.settled(agentId, 2);
    expect(f.loops[1]).toMatchObject({ role: "fork", allowedToolNames: [...TOOLS].sort() });
    expect(f.turns.at(-1)).toMatchObject({ wake: true, mode: "plan", model: "conn/fast" });
    expect(f.turns.at(-1)).not.toHaveProperty("selectedSkillIds");
    await f.close();
  });

  it("takes a requested model, refuses forks from subagents and calls outside a step", async () => {
    const hold = gate();
    const f = await fixture({ script: async () => { await hold.promise; return { reason: "completed", finalText: "B works." }; } });
    await parentMidTurn(f.root);
    const running = idOf(await fork(f));
    await until(() => f.live.has(running) && f.turns.length === 1);
    expect(await fork(f, { sessionId: running })).toEqual({ ok: false, code: "SUBAGENT_BLOCKED", text: "Subagents cannot use agent_fork." });
    hold.open();
    await f.settled(running);
    const started = await fork(f, { model: "conn/deep", reasoningEffort: "high", background: false });
    expect(started).toMatchObject({ ok: true });
    expect(started.text.split("\n")[0]).toMatch(/^Subagent [0-9a-f-]{36} \(try plan B\) finished\.$/);
    expect(started.text).toContain("B works.");
    expect(f.turns.at(-1)).toMatchObject({ model: "conn/deep", reasoningEffort: "high", thinkingEnabled: true, mode: "plan" });
    expect(await fork(f, { callId: "missing" })).toMatchObject({ ok: false, code: "FORK_UNAVAILABLE" });
    expect(await fork(f, { model: "conn/none" })).toMatchObject({ ok: false, code: "UNKNOWN_MODEL" });
    await f.close();
  });
});

function localClock(): string {
  const time = new Date("2026-11-03T10:30:00.000Z");
  return `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
}

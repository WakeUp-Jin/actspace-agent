import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeStreamEvent } from "@actspace/shared";
import { desktopBridgeContract } from "@actspace/shared/desktop-bridge";
import { createMockBridge, type MockBridgeHandle } from "../mock/create-mock-bridge";
import { MOCK_SCENARIOS, type MockScenario } from "../mock/scenarios";

let handle: MockBridgeHandle | null = null;
function open(scenario?: MockScenario, handlers?: Parameters<typeof createMockBridge>[0]["handlers"]) {
  handle = createMockBridge({ scenario, handlers });
  return handle;
}

afterEach(() => {
  handle?.dispose();
  handle = null;
  vi.useRealTimers();
});

describe("mock bridge", () => {
  it("exposes every contract member and nothing else", () => {
    const { bridge } = open();
    for (const [domain, members] of Object.entries(desktopBridgeContract)) {
      for (const member of Object.keys(members)) {
        expect(typeof (bridge as unknown as Record<string, Record<string, unknown>>)[domain][member], `${domain}.${member}`).toBe("function");
      }
    }
    expect(Object.keys(bridge).sort()).toEqual(Object.keys(desktopBridgeContract).sort());
  });

  it("rejects members without a mock implementation with a clear message", async () => {
    const { bridge } = open();
    await expect(bridge.terminal.create({ sessionId: "s", cols: 80, rows: 24 })).rejects.toThrow("Mock bridge does not implement terminal.create");
  });

  it("creates, lists, renames and forks sessions through the same projection path as Electron", async () => {
    const { bridge } = open();
    const created = await bridge.sessions.create();
    expect(created.kind).toBe("session-projection");
    await bridge.sessions.rename({ sessionId: created.sessionId, title: "重命名" });
    const fork = await bridge.sessions.fork({ sessionId: created.sessionId });

    const page = await bridge.sessions.listPage();
    expect(page.items.map((item) => item.title).sort()).toEqual(["重命名", "重命名 (fork)"]);
    expect(fork.sessionId).not.toBe(created.sessionId);
    expect((await bridge.sessions.get({ sessionId: "missing" }))).toBeNull();
  });

  it("streams a reply for a submitted task and persists both messages", async () => {
    vi.useFakeTimers();
    const { bridge } = open();
    const events: RuntimeStreamEvent[] = [];
    bridge.events.agentStream((event) => events.push(event));
    const { sessionId } = await bridge.sessions.create();

    const receipt = await bridge.tasks.submit({ sessionId, submissionId: "sub-1", userInput: "你好" });
    expect("task" in receipt && receipt.task.state).toBe("claimed");
    await vi.runAllTimersAsync();

    expect(events[0]?.type).toBe("agent_run_started");
    expect(events.some((event) => event.type === "assistant_text_delta")).toBe(true);
    expect(events.at(-1)?.type).toBe("agent_run_finished");
    const page = await bridge.sessions.getPage({ sessionId });
    expect(page.snapshot.messages.map((message) => message.kind)).toEqual(["user", "assistant"]);
  });

  it("stops an in-flight reply on a stop command", async () => {
    vi.useFakeTimers();
    const { bridge } = open();
    const events: RuntimeStreamEvent[] = [];
    bridge.events.agentStream((event) => events.push(event));
    const { sessionId } = await bridge.sessions.create();
    const receipt = await bridge.tasks.submit({ sessionId, submissionId: "sub-1", userInput: "你好" });
    await vi.advanceTimersByTimeAsync(100);

    await bridge.tasks.command({ sessionId, op: "stop", runId: "task" in receipt ? receipt.task.runId! : "" });
    await vi.runAllTimersAsync();

    expect(events.at(-1)?.type).toBe("agent_run_aborted");
    expect((await bridge.sessions.getPage({ sessionId })).snapshot.messages).toHaveLength(1);
  });

  it("detects settings revision conflicts", async () => {
    const { bridge } = open();
    const changed = vi.fn();
    bridge.events.settingsChanged(changed);
    const { revision } = await bridge.settings.getV4();

    const ok = await bridge.settings.updateV4({ namespace: "tools", patch: { disabledTools: ["bash"] }, expectedRevision: revision });
    const stale = await bridge.settings.updateV4({ namespace: "tools", patch: { disabledTools: [] }, expectedRevision: revision });

    expect(ok.ok).toBe(true);
    expect(stale).toMatchObject({ ok: false, code: "revision_conflict" });
    expect(changed).toHaveBeenCalledWith({ revision: "mock-2", changedNamespaces: ["tools"] });
  });

  it("lets test handlers override defaults", async () => {
    const { bridge } = open("empty", { app: { getBootstrapState: async () => ({ ...(await createMockBridge().bridge.app.getBootstrapState()), appVersion: "9.9.9" }) } });
    expect((await bridge.app.getBootstrapState()).appVersion).toBe("9.9.9");
  });

  it.each(Object.keys(MOCK_SCENARIOS) as MockScenario[])("seeds the %s scenario consistently", async (scenario) => {
    const { bridge, db } = open(scenario);
    const page = await bridge.sessions.listPage();
    for (const item of page.items) await expect(bridge.sessions.getPage({ sessionId: item.id })).resolves.toMatchObject({ sessionId: item.id });
    expect(page.items.length).toBe(db.sessions.size);
    if (scenario === "empty") expect(page.items).toEqual([]);
  });

  it("resolves the pending approval and finishes its run", async () => {
    const { bridge } = open("approval-pending");
    const events: RuntimeStreamEvent[] = [];
    bridge.events.agentStream((event) => events.push(event));
    const [pending] = await bridge.approvals.listPending();

    await expect(bridge.approvals.submit({ requestId: pending!.requestId, decision: "deny" })).resolves.toEqual({ ok: true });

    expect(events.map((event) => event.type)).toEqual(["tool_approval_resolved", "agent_run_finished"]);
    expect(await bridge.approvals.listPending()).toEqual([]);
  });

  it("starts the streaming scenario only after its session is opened", async () => {
    vi.useFakeTimers();
    const { bridge } = open("streaming");
    const events: RuntimeStreamEvent[] = [];
    bridge.events.agentStream((event) => events.push(event));
    await vi.advanceTimersByTimeAsync(1000);
    expect(events).toEqual([]);

    const [latest] = (await bridge.sessions.listPage()).items;
    await bridge.sessions.getPage({ sessionId: latest!.id });
    await vi.advanceTimersByTimeAsync(2000);

    expect(events[0]).toMatchObject({ type: "agent_run_started", sessionId: latest!.id });
    expect(events.some((event) => event.type === "agent_run_finished")).toBe(false);
  });

  it("refuses to submit to a session on a disconnected Host", async () => {
    const { bridge } = open("remote-host");
    const offline = (await bridge.sessions.listPage()).items.find((item) => item.hostId === "gpu-server");

    const result = await bridge.tasks.submit({ sessionId: offline!.id, submissionId: "sub-1", userInput: "hi" });

    expect(result).toMatchObject({ status: "submission-failed", acknowledgement: "rejected" });
    expect(offline!.connectionState).toBe("offline");
  });

  it("reconnects and removes Hosts by connection id, as main does", async () => {
    const { bridge } = open("remote-host");
    const changes: unknown[] = [];
    bridge.events.hostsChanged((hosts) => changes.push(hosts));

    await bridge.hosts.reconnect("conn-gpu");
    expect((await bridge.hosts.list()).find((host) => host.id === "conn-gpu")?.state).toBe("connected");

    await bridge.hosts.remove("conn-laptop");
    expect((await bridge.hosts.list()).map((host) => host.id)).toEqual(["conn-devbox", "conn-gpu"]);
    expect(changes).toHaveLength(2);
  });
});

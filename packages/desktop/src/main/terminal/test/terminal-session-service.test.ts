import { afterEach, describe, expect, it, vi } from "vitest";
import type { TerminalEvent } from "@actspace/shared";
import type { TerminalBackend, TerminalBackendExit } from "../terminal-backend";
import { TerminalSessionService } from "../terminal-session-service";

class FakeBackend implements TerminalBackend {
  pid = 999_999;
  writes: string[] = [];
  sizes: Array<[number, number]> = [];
  pauseCount = 0;
  resumeCount = 0;
  killed = false;
  private dataListeners = new Set<(data: string) => void>();
  private exitListeners = new Set<(event: TerminalBackendExit) => void>();

  write(data: string) { this.writes.push(data); }
  resize(cols: number, rows: number) { this.sizes.push([cols, rows]); }
  pause() { this.pauseCount += 1; }
  resume() { this.resumeCount += 1; }
  kill() { this.killed = true; }
  onData(listener: (data: string) => void) { this.dataListeners.add(listener); return () => this.dataListeners.delete(listener); }
  onExit(listener: (event: TerminalBackendExit) => void) { this.exitListeners.add(listener); return () => this.exitListeners.delete(listener); }
  emitData(data: string) { for (const listener of this.dataListeners) listener(data); }
  emitExit(exitCode: number) { for (const listener of this.exitListeners) listener({ exitCode }); }
}

function setup() {
  const events: TerminalEvent[] = [];
  const backends: FakeBackend[] = [];
  const service = new TerminalSessionService({
    readSession: async (sessionId) => sessionId === "session-1" ? { workspaceRoot: process.cwd() } : null,
    resolveWorkspaceRoot: async () => process.cwd(),
    createBackend: () => {
      const backend = new FakeBackend();
      backends.push(backend);
      return backend;
    },
    shellEnvironment: {
      resolve: async () => ({
        shell: "/bin/zsh",
        shellName: "zsh",
        args: ["-l"],
        env: { PATH: "/usr/bin", TERM: "xterm-256color" },
      }),
    } as never,
    sendEvent: (_ownerId, event) => events.push(event),
  });
  return { service, events, backends };
}

describe("TerminalSessionService", () => {
  afterEach(() => vi.useRealTimers());

  it("creates a session-bound terminal and enforces renderer ownership", async () => {
    const { service, backends } = setup();
    const created = await service.create("session-1", 7, 80, 24);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.terminal).toMatchObject({ sessionId: "session-1", shellName: "zsh", status: "running" });
    expect(service.write(created.terminal.id, 8, "pwd\r")).toMatchObject({
      ok: false,
      error: { code: "terminal_owned_by_another_window" },
    });
    expect(service.write(created.terminal.id, 7, "pwd\r")).toEqual({ ok: true });
    expect(backends[0].writes).toEqual(["pwd\r"]);
  });

  it("batches output, replays detached output, and applies ACK backpressure", async () => {
    vi.useFakeTimers();
    const { service, events, backends } = setup();
    const created = await service.create("session-1", 7, 80, 24);
    if (!created.ok) throw new Error("create failed");
    backends[0].emitData("before attach\r\n");
    service.attach(created.terminal.id, 7, 90, 30);
    expect(events.some((event) => event.type === "init_log" && event.data.includes("before attach"))).toBe(true);

    backends[0].emitData("a".repeat(270 * 1024));
    await vi.advanceTimersByTimeAsync(20);
    expect(events.some((event) => event.type === "data")).toBe(true);
    expect(backends[0].pauseCount).toBe(1);
    service.attach(created.terminal.id, 7, 90, 30);
    expect(backends[0].resumeCount).toBe(1);
    backends[0].emitData("b".repeat(270 * 1024));
    await vi.advanceTimersByTimeAsync(20);
    expect(backends[0].pauseCount).toBe(2);
    service.ack(created.terminal.id, 7, 270 * 1024);
    expect(backends[0].resumeCount).toBe(2);
  });

  it("rejects invalid dimensions, missing sessions, and oversized input", async () => {
    const { service } = setup();
    expect(await service.create("session-1", 7, 1, 24)).toMatchObject({ ok: false, error: { code: "invalid_terminal_size" } });
    expect(await service.create("missing", 7, 80, 24)).toMatchObject({ ok: false, error: { code: "session_not_found" } });
    const created = await service.create("session-1", 7, 80, 24);
    if (!created.ok) throw new Error("create failed");
    expect(service.write(created.terminal.id, 7, "x".repeat(65 * 1024))).toMatchObject({
      ok: false,
      error: { code: "invalid_terminal_input" },
    });
  });

  it("enforces the per-session limit and keeps detached replay bounded", async () => {
    const { service, events, backends } = setup();
    const created = [];
    for (let index = 0; index < 4; index += 1) {
      created.push(await service.create("session-1", 7, 80, 24));
    }
    expect(created.every((result) => result.ok)).toBe(true);
    expect(await service.create("session-1", 7, 80, 24)).toMatchObject({
      ok: false,
      error: { code: "terminal_limit_reached" },
    });

    const first = created[0];
    if (!first.ok) throw new Error("create failed");
    backends[0].emitData("界".repeat(100 * 1024));
    service.attach(first.terminal.id, 7, 80, 24);
    const replay = [...events].reverse().find((event) => event.type === "init_log");
    expect(replay?.type === "init_log" ? Buffer.byteLength(replay.data, "utf8") : 0).toBeLessThanOrEqual(128 * 1024);
    expect(replay?.type === "init_log" ? replay.truncated : false).toBe(true);
  });
});

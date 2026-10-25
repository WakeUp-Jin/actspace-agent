import { INHERITED_EVALUATION } from "../execution.js";
import { createSandboxService } from "../service.js";
import { BackendRegistry } from "../select.js";
import type { SandboxRequest } from "../types.js";
import { FULL, fakeBackend, fakeHost, tick } from "./fakes.js";

const timing = { killGraceMs: 20, residualWaitMs: 20 };
const request = (overrides: Partial<SandboxRequest> = {}): SandboxRequest => ({ purpose: "tool", isolation: "sandboxed", argv: ["/bin/zsh", "-lc", "echo hi"], cwd: "/work", env: {}, scratchDir: "/scratch", filesystem: { readWrite: ["/work", "/scratch"] }, ...overrides });

describe("backend selection", () => {
  it("prefers higher priority, falls through unavailable or partial backends, and explains failures", async () => {
    const registry = new BackendRegistry();
    const nono = fakeBackend("nono", 100, { available: false, reason: "not bundled" });
    const partial = fakeBackend("partial", 80, { available: true, version: "2", capabilities: { ...FULL, "filesystem.write-deny": "partial" } });
    const seatbelt = fakeBackend("seatbelt", 50);
    registry.register(seatbelt); registry.register(nono); registry.register(partial);
    const selection = await registry.select(["filesystem.write", "filesystem.write-deny"]);
    expect(selection.ok && selection.backend.id).toBe("seatbelt");
    const none = await new BackendRegistry().select([]);
    expect(none).toEqual({ ok: false, reasons: ["No sandbox backend is registered."] });
    const unregisterSeatbelt = registry.register(fakeBackend("other", 10, { available: false, reason: "x" }));
    unregisterSeatbelt();
    const failing = new BackendRegistry();
    failing.register(nono); failing.register(partial);
    expect(await failing.select(["filesystem.write-deny"])).toEqual({ ok: false, reasons: ["nono: not bundled", "partial 2: filesystem.write-deny=partial"] });
  });

  it("caches probes until the backend is unregistered, and rejects duplicate ids", async () => {
    const registry = new BackendRegistry();
    const backend = fakeBackend("nono", 100);
    const unregister = registry.register(backend);
    await registry.select([]); await registry.select([]);
    expect(backend.probes).toBe(1);
    expect(() => registry.register(fakeBackend("nono", 1))).toThrow(/already registered/);
    unregister();
    registry.register(backend);
    await registry.select([]);
    expect(backend.probes).toBe(2);
  });

  it("turns a throwing probe into an unavailable reason", async () => {
    const registry = new BackendRegistry();
    registry.register(fakeBackend("broken", 1, async () => { throw new Error("boom"); }));
    expect(await registry.select([])).toEqual({ ok: false, reasons: ["broken: probe failed: boom"] });
  });
});

describe("sandbox execution", () => {
  it("runs through the selected backend and reports facts separately from the exit", async () => {
    const host = fakeHost();
    const service = createSandboxService({ host, timing });
    const backend = fakeBackend("nono", 100);
    service.register(backend);
    const execution = service.run(request());
    const chunks: string[] = [];
    execution.onOutput(chunk => chunks.push(chunk.text));
    while (!host.processes[0]) await tick();
    expect(host.processes[0].spec).toMatchObject({ command: "/bin/nono", args: ["--", "/bin/zsh", "-lc", "echo hi"] });
    host.processes[0].emit({ stream: "stdout", text: "hi\n" });
    host.processes[0].exit({ exitCode: 3 });
    const result = await execution.result;
    expect(result.outcome).toEqual({ status: "exited", exitCode: 3, signal: null });
    expect(result.facts).toMatchObject({ isolation: "sandboxed", backend: { id: "nono", version: "1.0.0" }, capabilities: FULL, cleanup: "ok" });
    expect(result.facts.policyFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(chunks).toEqual(["hi\n"]);
    expect(backend.disposed).toBe(1);
  });

  it("never spawns when preparation fails", async () => {
    for (const [setup, reason] of [
      [() => undefined, "No sandbox backend is registered."],
      [(service: ReturnType<typeof createSandboxService>) => service.register(fakeBackend("nono", 100, undefined, { prepareError: "manifest" })), "nono: manifest"],
      [(service: ReturnType<typeof createSandboxService>) => service.register(fakeBackend("nono", 100, { available: true, version: "1", capabilities: { ...FULL, "filesystem.write-deny": "unsupported" } })), "nono 1: filesystem.write-deny=unsupported"],
    ] as const) {
      const host = fakeHost();
      const service = createSandboxService({ host, timing });
      setup(service);
      const result = await service.run(request()).result;
      expect(result.outcome).toEqual({ status: "prepare_failed", reasons: [reason] });
      expect(host.processes).toHaveLength(0);
    }
    const host = fakeHost();
    const invalid = await createSandboxService({ host, timing }).run(request({ cwd: "relative" })).result;
    expect(invalid.outcome.status).toBe("prepare_failed");
    expect(host.processes).toHaveLength(0);
  });

  it("reports a spawn error as prepare_failed", async () => {
    const service = createSandboxService({ host: fakeHost({ startError: "ENOENT" }), timing });
    service.register(fakeBackend("nono", 100));
    expect((await service.run(request()).result).outcome).toEqual({ status: "prepare_failed", reasons: ["spawn failed: ENOENT"] });
  });

  it("terminates with SIGTERM, escalates to SIGKILL after the grace period, then reports residue", async () => {
    const graceful = fakeHost();
    const service = createSandboxService({ host: graceful, timing });
    service.register(fakeBackend("nono", 100));
    const execution = service.run(request());
    while (!graceful.processes[0]) await tick();
    execution.terminate();
    expect(await execution.result).toMatchObject({ outcome: { status: "cancelled", signal: "SIGTERM", residual: false } });
    expect(graceful.processes[0].signals).toEqual(["SIGTERM"]);

    const stubborn = fakeHost({ ignore: ["SIGTERM"] });
    const second = createSandboxService({ host: stubborn, timing });
    second.register(fakeBackend("nono", 100));
    const run = second.run(request());
    while (!stubborn.processes[0]) await tick();
    run.terminate();
    expect((await run.result).outcome).toMatchObject({ status: "cancelled", signal: "SIGKILL", residual: false });
    expect(stubborn.processes[0].signals).toEqual(["SIGTERM", "SIGKILL"]);

    const unkillable = fakeHost({ ignore: ["SIGTERM", "SIGKILL"] });
    const third = createSandboxService({ host: unkillable, timing });
    third.register(fakeBackend("nono", 100));
    const stuck = third.run(request());
    while (!unkillable.processes[0]) await tick();
    stuck.terminate();
    expect((await stuck.result).outcome).toEqual({ status: "cancelled", exitCode: null, signal: null, residual: true });
  });

  it("kills surviving descendants after the leader exits and reports residue when they persist", async () => {
    const host = fakeHost({ descendantsSurvive: true, ignore: ["SIGKILL"] });
    const service = createSandboxService({ host, timing });
    service.register(fakeBackend("nono", 100));
    const execution = service.run(request());
    while (!host.processes[0]) await tick();
    execution.terminate();
    host.processes[0].exit({ exitCode: 143 });
    expect((await execution.result).outcome).toMatchObject({ status: "cancelled", residual: true });
  });

  it("times out through the same termination path", async () => {
    const host = fakeHost();
    const service = createSandboxService({ host, timing });
    service.register(fakeBackend("nono", 100));
    const result = await service.run(request({ timeoutMs: 10 })).result;
    expect(result.outcome).toMatchObject({ status: "timed_out", signal: "SIGTERM" });
  });

  it("cancels during preparation without spawning", async () => {
    const host = fakeHost();
    const service = createSandboxService({ host, timing });
    let release!: () => void;
    service.register(fakeBackend("nono", 100, () => new Promise(resolve => { release = () => resolve({ available: true, version: "1", capabilities: FULL }); })));
    const execution = service.run(request());
    while (!release) await tick();
    execution.terminate();
    release();
    expect((await execution.result).outcome).toEqual({ status: "cancelled", exitCode: null, signal: null, residual: false });
    expect(host.processes).toHaveLength(0);
  });

  it("forceTerminate sends SIGKILL immediately", async () => {
    const host = fakeHost({ ignore: ["SIGTERM"] });
    const service = createSandboxService({ host, timing: { killGraceMs: 10_000, residualWaitMs: 20 } });
    service.register(fakeBackend("nono", 100));
    const execution = service.run(request());
    while (!host.processes[0]) await tick();
    execution.forceTerminate();
    expect((await execution.result).outcome).toMatchObject({ status: "cancelled", signal: "SIGKILL" });
  });

  it("records cleanup failure without changing the outcome", async () => {
    const host = fakeHost();
    const service = createSandboxService({ host, timing });
    service.register(fakeBackend("nono", 100, undefined, { disposeError: "rm failed" }));
    const execution = service.run(request());
    while (!host.processes[0]) await tick();
    host.processes[0].exit({ exitCode: 0 });
    expect(await execution.result).toMatchObject({ outcome: { status: "exited", exitCode: 0 }, facts: { cleanup: { failed: "rm failed" } } });
  });

  it("runs approved unsandboxed requests directly without consulting backends", async () => {
    const host = fakeHost();
    const service = createSandboxService({ host, timing });
    const backend = fakeBackend("nono", 100);
    service.register(backend);
    const execution = service.run(request({ isolation: "none" }));
    while (!host.processes[0]) await tick();
    expect(host.processes[0].spec).toMatchObject({ command: "/bin/zsh", args: ["-lc", "echo hi"] });
    host.processes[0].exit({ exitCode: 0 });
    expect((await execution.result).facts).toMatchObject({ isolation: "none", cleanup: "ok" });
    expect(backend.probes + backend.prepared.length).toBe(0);
  });
});

describe("sandbox service status", () => {
  it("reports the selected backend or the reasons nothing qualifies", async () => {
    const service = createSandboxService({ host: fakeHost(), timing });
    expect(await service.status()).toEqual({ available: false, isolation: "sandboxed", reasons: ["No sandbox backend is registered."] });
    const unregister = service.register(fakeBackend("seatbelt", 50));
    expect(await service.status()).toEqual({ available: true, isolation: "sandboxed", backend: { id: "seatbelt", version: "1.0.0" }, reasons: [] });
    expect(await service.status("evaluation")).toMatchObject({ available: false, reasons: ["seatbelt 1.0.0: network.allowlist=unsupported"] });
    unregister();
    expect((await service.status()).available).toBe(false);
  });

  it("inherits the outer sandbox only when the Host port says so, without any backend", async () => {
    const host = { ...fakeHost(), inherited: true as const };
    const service = createSandboxService({ host, timing });
    expect(await service.status()).toEqual({ available: true, isolation: "inherited", reasons: [] });
    const execution = service.run(request());
    while (!host.processes[0]) await tick();
    expect(host.processes[0].spec.command).toBe("/bin/zsh");
    host.processes[0].exit({ exitCode: 0 });
    expect((await execution.result).facts.isolation).toBe("inherited");
    // A candidate never starts a nested evaluation.
    expect(await service.status("evaluation")).toEqual({ available: false, isolation: "inherited", reasons: [INHERITED_EVALUATION] });
    const nested = await service.run(request({ purpose: "evaluation", network: { mode: "allowlist", domains: ["api.example.com"] } })).result;
    expect(nested.outcome).toEqual({ status: "prepare_failed", reasons: [INHERITED_EVALUATION] });
    expect(host.processes).toHaveLength(1);
  });

  it("refuses evaluation when the backend lacks a reserved capability", async () => {
    const service = createSandboxService({ host: fakeHost(), timing });
    service.register(fakeBackend("nono", 100, { available: true, version: "1", capabilities: { ...FULL, "network.allowlist": "full" } }));
    expect(await service.status("evaluation")).toMatchObject({ available: true, backend: { id: "nono" } });
    const evaluation = (overrides: Partial<SandboxRequest>) => service.run(request({ purpose: "evaluation", network: { mode: "allowlist", domains: ["api.example.com"] }, ...overrides })).result;
    expect((await evaluation({ limits: { memoryBytes: 1 << 30 } })).outcome).toEqual({ status: "prepare_failed", reasons: ["nono 1: process.resource-limits=unsupported"] });
    expect((await evaluation({ network: { mode: "allowlist", domains: ["api.example.com"], credentials: [{ domain: "api.example.com", header: "Authorization", source: { env: "KEY" } }] } })).outcome)
      .toEqual({ status: "prepare_failed", reasons: ["nono 1: network.credential-injection=unsupported"] });
  });
});

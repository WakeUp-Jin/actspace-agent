import type { BackendProbe, CapabilityLevels, HostProcess, HostProcessExit, HostProcessSpec, OutputChunk, SandboxBackend, SandboxHostPort, SandboxPolicy } from "../types.js";

export const FULL: CapabilityLevels = Object.freeze({ "filesystem.write": "full", "filesystem.read-deny": "full", "filesystem.write-deny": "full", "network.blocked": "full", "network.allowlist": "unsupported", "process.inherit": "full" });

export type FakeProcess = HostProcess & { readonly spec: HostProcessSpec; readonly signals: string[]; emit(chunk: OutputChunk): void; exit(exit?: Partial<HostProcessExit>): void; alive: boolean };
/** A process that reacts to signals according to `behavior`. */
export function fakeHost(behavior: { readonly ignore?: readonly ("SIGTERM" | "SIGKILL")[]; readonly startError?: string; readonly descendantsSurvive?: boolean } = {}): SandboxHostPort & { readonly processes: FakeProcess[] } {
  const processes: FakeProcess[] = [];
  return {
    platform: "darwin", homeDir: "/Users/agent", resources: {}, processes,
    spawn(spec) {
      const listeners = new Set<(chunk: OutputChunk) => void>();
      let resolveExit!: (exit: HostProcessExit) => void;
      const exited = new Promise<HostProcessExit>(resolve => { resolveExit = resolve; });
      let leaderDone = false;
      const fake: FakeProcess = {
        spec, signals: [], pid: 4242, alive: true, exited,
        onOutput: listener => { listeners.add(listener); },
        emit: chunk => { for (const listener of listeners) listener(chunk); },
        exit: (exit = {}) => { if (leaderDone) return; leaderDone = true; if (!behavior.descendantsSurvive) fake.alive = false; resolveExit({ exitCode: exit.exitCode ?? null, signal: exit.signal ?? null, ...(exit.startError ? { startError: exit.startError } : {}) }); },
        signalGroup: signal => {
          fake.signals.push(signal);
          if (behavior.ignore?.includes(signal)) return;
          if (leaderDone) { fake.alive = false; return; }
          fake.exit({ signal });
        },
        groupAlive: () => fake.alive,
      };
      processes.push(fake);
      if (behavior.startError) queueMicrotask(() => fake.exit({ startError: behavior.startError }));
      return fake;
    },
    run: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
  };
}

export function fakeBackend(id: string, priority: number, probe: BackendProbe | (() => Promise<BackendProbe>) = { available: true, version: "1.0.0", capabilities: FULL }, options: { readonly prepareError?: string; readonly disposeError?: string } = {}): SandboxBackend & { probes: number; prepared: SandboxPolicy[]; disposed: number } {
  const backend = {
    id, priority, probes: 0, prepared: [] as SandboxPolicy[], disposed: 0,
    probe: async () => { backend.probes += 1; return typeof probe === "function" ? probe() : probe; },
    prepare: async (policy: SandboxPolicy) => {
      if (options.prepareError) throw new Error(options.prepareError);
      backend.prepared.push(policy);
      return { spawn: { command: `/bin/${id}`, args: ["--", ...policy.argv], cwd: policy.cwd, env: policy.env }, dispose: async () => { backend.disposed += 1; if (options.disposeError) throw new Error(options.disposeError); } };
    },
  };
  return backend;
}
export const tick = () => new Promise(resolve => setTimeout(resolve, 0));

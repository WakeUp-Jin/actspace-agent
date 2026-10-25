import { resolvePolicy, type SandboxTemplate } from "./policy.js";
import type { BackendRegistry } from "./select.js";
import type { HostProcess, HostProcessExit, HostProcessSpec, OutputChunk, PreparedLaunch, SandboxExecution, SandboxFacts, SandboxHostPort, SandboxIsolation, SandboxOutcome, SandboxRequest, SandboxResult } from "./types.js";

export type ExecutionTiming = { readonly killGraceMs: number; readonly residualWaitMs: number };
export const DEFAULT_EXECUTION_TIMING: ExecutionTiming = Object.freeze({ killGraceMs: 2_000, residualWaitMs: 1_000 });
const RESIDUAL_POLL_MS = 50;

type StopReason = "cancelled" | "timed_out";

/** One execution, start to cleanup. Nothing is spawned unless every preparation step succeeded. */
export function startExecution(input: { readonly request: SandboxRequest; readonly mode: "sandboxed" | "inherited"; readonly host: SandboxHostPort; readonly registry: BackendRegistry; readonly template: SandboxTemplate | undefined; readonly timing?: ExecutionTiming }): SandboxExecution {
  const timing = input.timing ?? DEFAULT_EXECUTION_TIMING;
  const listeners = new Set<(chunk: OutputChunk) => void>();
  let child: HostProcess | undefined;
  let stopReason: StopReason | undefined;
  let finished = false;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  let killSent: (() => void) | undefined;
  let killWasSent = false;
  const sendKill = () => {
    if (!child || killWasSent) return;
    killWasSent = true;
    if (killTimer !== undefined) clearTimeout(killTimer);
    child.signalGroup("SIGKILL");
    killSent?.();
  };
  const stop = (reason: StopReason) => {
    if (finished || stopReason) return;
    stopReason = reason;
    if (!child) return; // Still preparing; the run loop observes stopReason before spawning.
    child.signalGroup("SIGTERM");
    killTimer = setTimeout(sendKill, timing.killGraceMs);
    killTimer.unref?.();
  };

  const result = (async (): Promise<SandboxResult> => {
    const isolation: SandboxIsolation = input.request.isolation === "none" ? "none" : input.mode === "inherited" ? "inherited" : "sandboxed";
    const resolved = await resolvePolicy(input.request, input.template);
    if (!resolved.ok) return { outcome: { status: "prepare_failed", reasons: resolved.reasons }, facts: { isolation, cleanup: "ok" } };
    const policy = resolved.policy;
    let facts: Omit<SandboxFacts, "cleanup"> = { isolation, policyFingerprint: policy.fingerprint };
    let launch: PreparedLaunch | undefined;
    let spec: HostProcessSpec;
    if (isolation === "sandboxed") {
      const selection = await input.registry.select(policy.requiredCapabilities);
      if (!selection.ok) return { outcome: { status: "prepare_failed", reasons: selection.reasons }, facts: { ...facts, cleanup: "ok" } };
      facts = { ...facts, backend: { id: selection.backend.id, version: selection.version }, capabilities: selection.capabilities };
      try { launch = await selection.backend.prepare(policy); }
      catch (error) { return { outcome: { status: "prepare_failed", reasons: [`${selection.backend.id}: ${message(error)}`] }, facts: { ...facts, cleanup: "ok" } }; }
      spec = launch.spawn;
    } else {
      spec = { command: policy.argv[0]!, args: policy.argv.slice(1), cwd: policy.cwd, env: policy.env };
    }
    const finish = async (outcome: SandboxOutcome): Promise<SandboxResult> => {
      finished = true;
      if (killTimer !== undefined) clearTimeout(killTimer);
      let cleanup: SandboxFacts["cleanup"] = "ok";
      if (launch) try { await launch.dispose(); } catch (error) { cleanup = { failed: message(error) }; }
      return { outcome, facts: { ...facts, cleanup } };
    };
    if (stopReason) return finish({ status: stopReason, exitCode: null, signal: null, residual: false });

    child = input.host.spawn(spec);
    child.onOutput(chunk => { for (const listener of listeners) listener(chunk); });
    const timeout = policy.timeoutMs === undefined ? undefined : setTimeout(() => stop("timed_out"), policy.timeoutMs);
    timeout?.unref?.();
    try {
      const exit = await new Promise<HostProcessExit | undefined>((resolveExit) => {
        void child!.exited.then(resolveExit);
        killSent = () => { const timer = setTimeout(() => resolveExit(undefined), timing.residualWaitMs); timer.unref?.(); };
      });
      if (exit?.startError !== undefined) return finish({ status: "prepare_failed", reasons: [`spawn failed: ${exit.startError}`] });
      if (!stopReason) return finish({ status: "exited", exitCode: exit!.exitCode, signal: exit!.signal });
      const residual = exit === undefined || await groupSurvives(child, timing.residualWaitMs);
      return finish({ status: stopReason, exitCode: exit?.exitCode ?? null, signal: exit?.signal ?? null, residual });
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  })();

  return Object.freeze({
    onOutput: (listener: (chunk: OutputChunk) => void) => { listeners.add(listener); },
    terminate: () => stop("cancelled"),
    forceTerminate: () => { stop("cancelled"); sendKill(); },
    result,
  });
}

/** The leader exited; descendants of the group may not have. Kill them and report what remains. */
async function groupSurvives(child: HostProcess, waitMs: number): Promise<boolean> {
  if (!child.groupAlive()) return false;
  child.signalGroup("SIGKILL");
  for (let waited = 0; waited < waitMs; waited += RESIDUAL_POLL_MS) {
    await new Promise(resolveWait => setTimeout(resolveWait, RESIDUAL_POLL_MS));
    if (!child.groupAlive()) return false;
  }
  return true;
}
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }

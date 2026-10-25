import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { StringDecoder } from "node:string_decoder";
import type { HostProcess, HostProcessExit, HostProcessSpec, OutputChunk, SandboxHostPort } from "./types.js";

/** Host side of the sandbox: spawning and process-group signals. Whether to sandbox is decided in the Harness. */
export function createNodeSandboxHostPort(options: { readonly nonoPath?: string } = {}): SandboxHostPort {
  return Object.freeze({
    platform: process.platform,
    homeDir: homedir(),
    resources: Object.freeze(options.nonoPath === undefined ? {} : { nonoPath: options.nonoPath }),
    spawn: spawnHostProcess,
    run: runBounded,
  });
}

export function spawnHostProcess(spec: HostProcessSpec): HostProcess {
  const group = process.platform !== "win32";
  const child = spawn(spec.command, [...spec.args], { cwd: spec.cwd, env: spec.env, stdio: ["ignore", "pipe", "pipe"], detached: group });
  const listeners = new Set<(chunk: OutputChunk) => void>();
  const forward = (stream: OutputChunk["stream"]) => {
    const decoder = new StringDecoder("utf8");
    const emit = (text: string) => { if (text) for (const listener of listeners) listener({ stream, text }); };
    child[stream].on("data", (value: Buffer) => emit(decoder.write(value)));
    child[stream].on("end", () => emit(decoder.end()));
  };
  forward("stdout");
  forward("stderr");
  let startError: string | undefined;
  child.once("error", (error) => { startError = error.message; });
  const exited = new Promise<HostProcessExit>((resolveExit) => {
    child.once("close", (exitCode, signal) => resolveExit({ exitCode, signal, ...(startError === undefined ? {} : { startError }) }));
  });
  const signalGroup = (signal: NodeJS.Signals | 0): boolean => {
    try {
      if (group && child.pid !== undefined) process.kill(-child.pid, signal);
      else if (signal !== 0) child.kill(signal);
      else return child.exitCode === null && child.signalCode === null;
      return true;
    } catch { return false; } // Group already gone.
  };
  return Object.freeze({
    pid: child.pid,
    onOutput: (listener: (chunk: OutputChunk) => void) => { listeners.add(listener); },
    exited,
    signalGroup: (signal: "SIGTERM" | "SIGKILL") => { signalGroup(signal); },
    groupAlive: () => signalGroup(0),
  });
}

async function runBounded(spec: HostProcessSpec & { readonly timeoutMs: number }): Promise<{ readonly exitCode: number | null; readonly stdout: string; readonly stderr: string; readonly error?: string }> {
  const child = spawnHostProcess(spec);
  let stdout = "";
  let stderr = "";
  child.onOutput((chunk) => { if (chunk.stream === "stdout") stdout += chunk.text; else stderr += chunk.text; });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.signalGroup("SIGKILL"); }, spec.timeoutMs);
  timer.unref?.();
  const exit = await child.exited.finally(() => clearTimeout(timer));
  const error = exit.startError ?? (timedOut ? `timed out after ${spec.timeoutMs}ms` : undefined);
  return { exitCode: exit.exitCode, stdout, stderr, ...(error === undefined ? {} : { error }) };
}

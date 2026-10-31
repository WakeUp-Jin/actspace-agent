import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SandboxExecution, SandboxRequest, SandboxResult, SandboxService, SandboxStatus } from "@actspace/sandbox/types";
import type { HarnessEvaluationHostPort } from "../types.js";

/** What the fake candidate does inside the "sandbox": its argv is the real CLI argv, so it can find `--out` and the copies. */
export type FakeCandidate = (request: SandboxRequest, argv: Record<string, string>) => Promise<SandboxResult["outcome"] | "hang">;

export function fakeSandbox(candidate: FakeCandidate, status: Partial<SandboxStatus> = {}): SandboxService & { readonly requests: SandboxRequest[]; terminated: number } {
  const sandbox = {
    requests: [] as SandboxRequest[], terminated: 0,
    register: () => () => undefined,
    status: async () => ({ available: true, isolation: "sandboxed" as const, reasons: [], ...status }),
    run(request: SandboxRequest): SandboxExecution {
      sandbox.requests.push(request);
      let cancel!: () => void;
      const cancelled = new Promise<SandboxResult["outcome"]>(resolve => { cancel = () => resolve({ status: "cancelled", exitCode: null, signal: "SIGTERM", residual: false }); });
      const listeners: ((chunk: { stream: "stdout" | "stderr"; text: string }) => void)[] = [];
      const result = (async () => {
        await Promise.resolve();
        for (const listener of listeners) listener({ stream: "stdout", text: "candidate output\n" });
        const ran = await candidate(request, flags(request.argv));
        const outcome = ran === "hang" ? await cancelled : ran;
        return { outcome, facts: { isolation: "sandboxed" as const, backend: { id: "fake", version: "1" }, cleanup: "ok" as const } };
      })();
      return { onOutput: listener => { listeners.push(listener); }, terminate: () => { sandbox.terminated += 1; cancel(); }, forceTerminate: () => cancel(), result };
    },
  };
  return sandbox;
}

function flags(argv: readonly string[]): Record<string, string> {
  return Object.fromEntries(argv.flatMap((arg, index) => arg.startsWith("--") && argv[index + 1] !== undefined && !argv[index + 1]!.startsWith("--") ? [[arg.slice(2), argv[index + 1]!]] : []));
}

export const exited = (exitCode = 0): SandboxResult["outcome"] => ({ status: "exited", exitCode, signal: null });
export async function writeResult(out: string, result: unknown): Promise<void> {
  await mkdir(out, { recursive: true });
  await writeFile(join(out, "result.json"), typeof result === "string" ? result : JSON.stringify(result));
}
export const completedResult = { schemaVersion: 1, ok: true, status: "completed", exitCode: 0, finalText: "done", harness: { harnessId: "main", revision: 1, executionDigest: "sha256-run" } };

export function fakeHost(artifactRoot: string, model: Partial<Awaited<ReturnType<HarnessEvaluationHostPort["modelEnvironment"]>>> = {}): HarnessEvaluationHostPort & { readonly models: (string | undefined)[] } {
  const models: (string | undefined)[] = [];
  return {
    launcher: ["/usr/bin/node", "/repo/apps/cli/dist/cli.js"], artifactRoot, models,
    modelEnvironment: async (id) => { models.push(id); return { env: { LLM_PROVIDER: "fake", FAKE_API_KEY: "sk-test", FAKE_BASE_URL: "http://127.0.0.1:4100" }, domains: [], localPorts: [4100], ...model }; },
  };
}

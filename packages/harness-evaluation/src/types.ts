import type { SelectionDescription } from "@actspace/harness-control";
import type { SandboxResult } from "@actspace/sandbox/types";

/** Host port: how to start a candidate and how it reaches the model. Keys only leave the Host through `modelEnvironment`. */
export const HARNESS_EVALUATION_HOST_PORT_ID = "actspace.host.harness-evaluation" as const;
export const HARNESS_EVALUATION_SERVICE_ID = "harness.evaluation" as const;

export type HarnessModelEnvironment = {
  /** Variables the candidate CLI needs to reach the model (provider, base URL, key). */
  readonly env: Readonly<Record<string, string>>;
  readonly domains: readonly string[];
  /** Loopback ports, for a model served on 127.0.0.1. */
  readonly localPorts?: readonly number[];
  /** `host:port`; the sandbox proxy forwards allowed connections through it. */
  readonly upstreamProxy?: string;
};
export interface HarnessEvaluationHostPort {
  /** Command prefix that starts the CLI, e.g. `[node, <repo>/apps/cli/dist/cli.js]`. */
  readonly launcher: readonly string[];
  /** The running app's `harness-artifacts` directory; only read. */
  readonly artifactRoot: string;
  modelEnvironment(model: string | undefined): Promise<HarnessModelEnvironment>;
}

export type HarnessEvaluationRequest = {
  readonly selection: SelectionDescription;
  /** Compared only when given: the digest binds the Host contract, so a selection from another Host differs. */
  readonly executionDigest?: string;
  readonly task: { readonly input: string; readonly model?: string };
  /** Copied; the candidate never sees the original. */
  readonly workspace: string;
  readonly timeoutMs?: number;
};
/** The candidate CLI's `out/result.json`; only the fields read here are typed. */
export type HarnessEvaluationCliResult = {
  readonly schemaVersion: 1;
  readonly ok: boolean;
  readonly status: string;
  readonly exitCode: number;
  readonly finalText: string;
  readonly harness?: { readonly harnessId: string; readonly revision: number; readonly executionDigest: string };
  readonly error?: { readonly code: string; readonly message: string };
  readonly [key: string]: unknown;
};
export type HarnessEvaluationOutcome = {
  readonly status: "completed" | "failed" | "timed_out" | "cancelled";
  readonly result?: HarnessEvaluationCliResult;
  /** Absent when the evaluation failed before the sandbox started. */
  readonly sandbox?: SandboxResult;
  readonly outputTail: string;
  readonly error?: string;
  readonly cleanup: "ok" | { readonly failed: string };
};
export type HarnessEvaluationResult = { readonly status: "unavailable"; readonly reasons: readonly string[] } | HarnessEvaluationOutcome;
export interface HarnessEvaluationService {
  status(): Promise<{ readonly available: boolean; readonly reasons: readonly string[] }>;
  run(request: HarnessEvaluationRequest, signal?: AbortSignal): Promise<HarnessEvaluationResult>;
}

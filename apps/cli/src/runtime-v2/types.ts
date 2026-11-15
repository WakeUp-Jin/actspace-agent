import type { PermissionMode, RuntimeSessionSnapshot } from "@actspace/shared/runtime-v2";

export type RuntimePermissionMode = PermissionMode;

export type RuntimeCliExitCode = 0 | 1 | 2 | 3 | 4 | 130 | 143;
export type RuntimeCliOutputFormat = "text" | "json" | "jsonl";

export type RuntimeRunCommandOptions = {
  readonly input?: string;
  readonly inputFile?: string;
  readonly workspace?: string;
  readonly permissionMode: RuntimePermissionMode;
  readonly permissionModeExplicit?: boolean;
  readonly outputFormat: RuntimeCliOutputFormat;
  readonly out?: string;
  readonly mock: boolean;
  readonly model?: string;
  readonly dataDir?: string;
  readonly persist?: boolean;
  readonly resume?: string;
  readonly sandboxInherited?: boolean;
  readonly harness?: string;
};

export type RuntimeCliArtifactResult = {
  readonly schemaVersion: 1;
  readonly ok: boolean;
  readonly status: "completed" | "failed" | "aborted" | "approval_required";
  readonly exitCode: RuntimeCliExitCode;
  readonly sessionId: string;
  readonly agentRunId: string;
  readonly taskId?: string;
  readonly outcome?: import("@actspace/shared/runtime-v2").RunOutcome;
  readonly value?: import("@actspace/shared/runtime-v2").RuntimeJsonValue;
  readonly finalText: string;
  readonly snapshot?: RuntimeSessionSnapshot;
  readonly model?: string;
  readonly provider?: string;
  readonly stopReason?: string;
  readonly totalUsage?: unknown;
  readonly messageCount: number;
  readonly eventCount: number;
  readonly permissionMode: RuntimePermissionMode;
  readonly workspace: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly error?: { readonly code: string; readonly message: string };
  readonly persistent?: boolean;
  /** Present for `--harness` runs: the Harness that actually ran under this Host. */
  readonly harness?: { readonly harnessId: string; readonly revision: number; readonly executionDigest: string };
};

export type RuntimeRunCommandControl = {
  readonly sessionId: string;
  readonly agentRunId: string;
  readonly abort: () => boolean;
};

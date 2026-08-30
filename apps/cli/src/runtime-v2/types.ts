import type { RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";

export type RuntimeV2PermissionMode = "default" | "trusted" | "yolo";

export type RuntimeV2CliExitCode = 0 | 1 | 2 | 3 | 4 | 130;
export type RuntimeV2CliOutputFormat = "text" | "json" | "jsonl";

export type RuntimeV2RunCommandOptions = {
  readonly input?: string;
  readonly inputFile?: string;
  readonly workspace?: string;
  readonly permissionMode: RuntimeV2PermissionMode;
  readonly outputFormat: RuntimeV2CliOutputFormat;
  readonly out?: string;
  readonly mock: boolean;
  readonly model?: string;
  readonly dataDir?: string;
  readonly persist?: boolean;
  readonly resume?: string;
};

export type RuntimeV2CliArtifactResult = {
  readonly schemaVersion: 1;
  readonly ok: boolean;
  readonly status: "completed" | "failed" | "aborted" | "approval_required";
  readonly exitCode: RuntimeV2CliExitCode;
  readonly sessionId: string;
  readonly agentRunId: string;
  readonly turnId?: string;
  readonly reason?: "completed" | "aborted" | "failed" | "step-limit" | "concludes-turn";
  readonly steps?: number;
  readonly finalText: string;
  readonly snapshot?: RuntimeV2SessionSnapshot;
  readonly model?: string;
  readonly provider?: string;
  readonly stopReason?: string;
  readonly totalUsage?: unknown;
  readonly messageCount: number;
  readonly eventCount: number;
  readonly permissionMode: RuntimeV2PermissionMode;
  readonly workspace: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly error?: { readonly code: string; readonly message: string };
  readonly persistent?: boolean;
};

export type RuntimeV2RunCommandControl = {
  readonly sessionId: string;
  readonly agentRunId: string;
  readonly abort: () => boolean;
};

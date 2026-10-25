import type { RuntimeV2HostDescriptor } from "@actspace/shared/runtime-v2";
import type { AgentLoopLiveEvent } from "@actspace/core-agent-loop";
import type { ToolPreparedEnvironment } from "@actspace/tools-runtime";

export const AGENT_RUNTIME_HOST_PORT_ID = "actspace.host.agent" as const;

/**
 * A Harness selection the Host boots instead of the built-in one, without its own selection history (an evaluation
 * candidate's data root is fresh and thrown away). `executionDigest`, when given, must match the mounted Harness;
 * it includes the Host contract, so it only matches selections prepared for this same kind of Host.
 */
export type PinnedHarness = { readonly description: import("@actspace/harness-control").SelectionDescription; readonly executionDigest?: string };
export class PinnedHarnessError extends Error {
  readonly code = "HARNESS_SELECTION_INVALID";
  constructor(message: string, options?: ErrorOptions) { super(message, options); this.name = "PinnedHarnessError"; }
}

export type AgentRuntimeHostPort = {
  readonly evolution?: import("@actspace/plugin-manager").PluginManagerPort;
  readonly contextDisclosure?: import("@actspace/context-disclosure").DisclosureHost;
  readonly authorizeHarness?: import("@actspace/harness-control").HarnessAuthorizer;
  readonly onHarnessDiagnostic?: (error: unknown) => void;
  /** The main Harness's tool sandbox once it has mounted; undefined when the sandbox plugin is absent. */
  readonly onSandboxStatus?: (status: import("@actspace/sandbox/types").SandboxStatus | undefined) => void;
  readonly disabledHarnessEntries?: readonly string[];
  readonly pinnedHarness?: PinnedHarness;
  readonly host: RuntimeV2HostDescriptor;
  readonly toolEnvironment: Omit<ToolPreparedEnvironment, "journal">;
  readonly workspaceRoot: string;
  readonly compositionDigest: string;
  readonly hostCapabilityDigest: string;
  readonly plugins: readonly { readonly id: string; readonly version: string }[];
  readonly chatCompactionTriggerRatio?: () => number;
  readonly onLiveEvent?: (event: AgentLoopLiveEvent) => void;
};

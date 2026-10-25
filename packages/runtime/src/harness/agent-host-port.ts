import type { RuntimeV2HostDescriptor } from "@actspace/shared/runtime-v2";
import type { AgentLoopLiveEvent } from "@actspace/core-agent-loop";
import type { ToolPreparedEnvironment } from "@actspace/tools-runtime";

export const AGENT_RUNTIME_HOST_PORT_ID = "actspace.host.agent" as const;

export type AgentRuntimeHostPort = {
  readonly evolution?: import("@actspace/plugin-manager").PluginManagerPort;
  readonly contextDisclosure?: import("@actspace/context-disclosure").DisclosureHost;
  readonly authorizeHarness?: import("@actspace/harness-control").HarnessAuthorizer;
  readonly onHarnessDiagnostic?: (error: unknown) => void;
  /** The main Harness's tool sandbox once it has mounted; undefined when the sandbox plugin is absent. */
  readonly onSandboxStatus?: (status: import("@actspace/sandbox/types").SandboxStatus | undefined) => void;
  readonly disabledHarnessEntries?: readonly string[];
  readonly host: RuntimeV2HostDescriptor;
  readonly toolEnvironment: Omit<ToolPreparedEnvironment, "journal">;
  readonly workspaceRoot: string;
  readonly compositionDigest: string;
  readonly hostCapabilityDigest: string;
  readonly plugins: readonly { readonly id: string; readonly version: string }[];
  readonly chatCompactionTriggerRatio?: () => number;
  readonly onLiveEvent?: (event: AgentLoopLiveEvent) => void;
};

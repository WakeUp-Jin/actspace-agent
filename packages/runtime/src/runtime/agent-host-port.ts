import type { RuntimeV2HostDescriptor } from "@actspace/shared/runtime-v2";
import type { AgentLoopLiveEvent } from "@actspace/core-agent-loop";
import type { ToolPreparedEnvironment } from "@actspace/tools-runtime";

export const AGENT_RUNTIME_HOST_PORT_ID = "actspace.host.agent" as const;

export type AgentRuntimeHostPort = {
  readonly host: RuntimeV2HostDescriptor;
  readonly toolEnvironment: Omit<ToolPreparedEnvironment, "journal">;
  readonly workspaceRoot: string;
  readonly compositionDigest: string;
  readonly hostCapabilityDigest: string;
  readonly plugins: readonly { readonly id: string; readonly version: string }[];
  readonly chatCompactionTriggerRatio?: () => number;
  readonly onLiveEvent?: (event: AgentLoopLiveEvent) => void;
};

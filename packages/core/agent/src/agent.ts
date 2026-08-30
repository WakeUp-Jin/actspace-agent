import type { AgentDescriptor } from "./descriptor.js";
import type { AgentScope } from "@actspace/core-scope";
import type { SessionHandle } from "@actspace/session-persistence";
import type { AgentSubject } from "./dispatch.js";

export type AgentHandle = {
  readonly agentId: string;
  readonly descriptor: AgentDescriptor;
  readonly scope: AgentScope;
  readonly session: SessionHandle;
  readonly subject?: AgentSubject;
  readonly dispose: () => Promise<void>;
};

import type { AgentDescriptor, MainAgentInbox } from "@actspace/agent";
import type { AgentScope } from "@actspace/scope";
import type { SessionHandle } from "@actspace/session-persistence";
import type { AgentLoop } from "./loop.js";

export type AgentLoopAssembly = {
  readonly descriptor: AgentDescriptor;
  readonly scope: AgentScope;
  readonly subject?: import("@actspace/agent").AgentSubject;
  readonly session: SessionHandle;
  readonly inbox: MainAgentInbox;
  readonly loop: AgentLoop;
  readonly dispose: () => Promise<void>;
};

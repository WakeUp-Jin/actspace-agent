import {
  loadAgentRuntimeContext,
  type LoadAgentRuntimeContextInput,
} from "@actspace/agent-core";

export type MainAgentRuntimeContextInput = LoadAgentRuntimeContextInput;

/** Desktop compatibility wrapper; context assembly is owned by agent-core/runtime. */
export const loadMainAgentRuntimeContext = loadAgentRuntimeContext;

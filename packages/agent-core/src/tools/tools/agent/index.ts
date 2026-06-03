import type { InternalTool } from "../../../internal-tools";
import type { LLMService } from "../../../llm/types";
import { agentDefinition } from "./definition";
import {
  parseAgentToolInput,
  resultFromAgentToolOutput,
  runExploreSubAgent,
  type AgentToolRuntime,
} from "./runner";

export type CreateAgentToolOptions = {
  llm: LLMService;
  workspaceRoot: string;
  sessionId?: string;
  turnId?: string;
  contextWindow?: number;
};

export function createAgentTool(options: CreateAgentToolOptions): InternalTool {
  const runtime: AgentToolRuntime = {
    llm: options.llm,
    workspaceRoot: options.workspaceRoot,
    sessionId: options.sessionId,
    turnId: options.turnId,
    contextWindow: options.contextWindow,
  };

  return {
    name: agentDefinition.name,
    description: agentDefinition.description,
    parameters: agentDefinition.parameters,
    isReadOnly: agentDefinition.isReadOnly,
    category: agentDefinition.category,
    previewKind: agentDefinition.previewKind,
    handler: async (args, executeOptions) => {
      const input = parseAgentToolInput(args);
      if (!input) {
        return {
          success: false,
          error: "Agent requires description, prompt, and subagent_type='explore' when provided.",
        };
      }

      const output = await runExploreSubAgent({
        args: input,
        runtime,
        parentSignal: executeOptions?.signal,
        parentToolCallId: executeOptions?.toolCallId,
        eventSink: executeOptions?.subagentEventSink,
      });
      return resultFromAgentToolOutput(output);
    },
  };
}

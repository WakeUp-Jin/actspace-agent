import type { InternalTool } from "../../../internal-tools";
import type { LLMService } from "../../../llm/types";
import { agentDefinition, exploreDefinition } from "./definition";
import { FOCUSED_EXPLORE_SYSTEM_PROMPT } from "./explore-prompt";
import {
  parseAgentToolInput,
  resultFromAgentToolOutput,
  runExploreSubAgent,
  type AgentToolRuntime,
} from "./runner";

/** 聚焦 Explore 子代理的循环硬上限。比通用 agent（100）小，强约束「小而专注」。 */
const FOCUSED_EXPLORE_MAX_TURNS = 20;

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
    display: "panel",
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

export type CreateExploreToolOptions = CreateAgentToolOptions;

/**
 * 内置 `explore` 工具：聚焦小范围探索。复用 SubAgent runner，但用更便宜的模型（由调用方注入
 * 的 `llm`，通常是 flash）、收窄的系统提示词、更小的 maxTurns，以及内联折叠展示。
 */
export function createExploreTool(options: CreateExploreToolOptions): InternalTool {
  const runtime: AgentToolRuntime = {
    llm: options.llm,
    workspaceRoot: options.workspaceRoot,
    sessionId: options.sessionId,
    turnId: options.turnId,
    contextWindow: options.contextWindow,
    systemPrompt: FOCUSED_EXPLORE_SYSTEM_PROMPT,
    maxTurns: FOCUSED_EXPLORE_MAX_TURNS,
    display: "inline",
  };

  return {
    name: exploreDefinition.name,
    description: exploreDefinition.description,
    parameters: exploreDefinition.parameters,
    isReadOnly: exploreDefinition.isReadOnly,
    category: exploreDefinition.category,
    previewKind: exploreDefinition.previewKind,
    handler: async (args, executeOptions) => {
      const input = parseAgentToolInput(args);
      if (!input) {
        return {
          success: false,
          error: "Explore requires a description and a focused prompt.",
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

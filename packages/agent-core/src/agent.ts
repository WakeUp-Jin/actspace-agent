/**
 * Agent 兼容层
 *
 * 保留旧版 createAgentRuntime/AgentRuntimeDeps/TurnTrace 接口，
 * 供 desktop/main/index.ts 等现有消费者使用。
 *
 * 新代码应直接使用 engine/ 目录下的 Agent 类和 runAgentLoop。
 * 此文件将在所有消费者迁移后移除。
 */

import type {
  AssistantReply,
  AgentTurnResult,
  ContextUsageSnapshot,
  SessionEvent,
  SessionId,
  ToolExecutionResult
} from "@actspace/shared";
import { createEmptyContextState, createUsageSnapshot } from "./context";
import type { ModelProvider, ModelProviderInput } from "./types";
import type { ToolRegistry } from "./tools";

// Re-export 新引擎的所有导出
export * from "./engine/index";

// ─── 旧版接口（向后兼容） ───

export type AgentRuntimeDeps = {
  provider: ModelProvider;
  tools: ToolRegistry;
};

export type TurnTrace = {
  events: SessionEvent[];
  toolResults: ToolExecutionResult[];
  finalReply?: AssistantReply;
  contextSnapshot: ContextUsageSnapshot;
};

function createTimestamp() {
  return new Date().toISOString();
}

function createEventId() {
  return `evt_${Math.random().toString(36).slice(2, 10)}`;
}

function createEvent<TPayload>(sessionId: SessionId, turnId: string, type: SessionEvent["type"], payload: TPayload): SessionEvent<TPayload> {
  return {
    id: createEventId(),
    sessionId,
    turnId,
    type,
    timestamp: createTimestamp(),
    schemaVersion: 1,
    payload
  };
}

export function createAgentRuntime(deps: AgentRuntimeDeps) {
  return {
    async runTurn(input: ModelProviderInput): Promise<AgentTurnResult> {
      const contextState = createEmptyContextState(input.sessionId);
      const events: SessionEvent[] = [];
      const toolResults: ToolExecutionResult[] = [];

      const userEvent = createEvent(input.sessionId, input.turnId, "user_message", {
        content: input.userInput
      });
      events.push(userEvent);
      contextState.events.push(userEvent);

      const modelOutput = await deps.provider.completeTurn(input);

      if (modelOutput.thinking) {
        const thinkingEvent = createEvent(input.sessionId, input.turnId, "thinking", {
          content: modelOutput.thinking
        });
        events.push(thinkingEvent);
        contextState.events.push(thinkingEvent);
      }

      for (const toolCall of modelOutput.toolCalls) {
        const toolCallEvent = createEvent(input.sessionId, input.turnId, "tool_call", toolCall);
        events.push(toolCallEvent);
        contextState.events.push(toolCallEvent);

        const toolResult = await deps.tools.execute(toolCall.name, toolCall.arguments, {
          sessionId: input.sessionId,
          turnId: input.turnId
        });
        toolResults.push(toolResult);

        const toolResultEvent = createEvent(input.sessionId, input.turnId, "tool_result", toolResult);
        events.push(toolResultEvent);
        contextState.events.push(toolResultEvent);
      }

      const finalReply = modelOutput.finalReply
        ? ({
            content: modelOutput.finalReply,
            stopReason: modelOutput.toolCalls.length > 0 ? "toolUse" : "stop",
            model: modelOutput.model,
            provider: modelOutput.provider,
            usage: modelOutput.usage
          } satisfies AssistantReply)
        : undefined;

      if (finalReply) {
        const replyEvent = createEvent(input.sessionId, input.turnId, "assistant_message", finalReply);
        events.push(replyEvent);
        contextState.events.push(replyEvent);
      }

      const contextSnapshot = input.contextSnapshot ?? createUsageSnapshot(modelOutput.usage.totalTokens);
      const snapshotEvent = createEvent(input.sessionId, input.turnId, "context_snapshot", contextSnapshot);
      events.push(snapshotEvent);
      contextState.events.push(snapshotEvent);

      const outcome: AgentTurnResult = {
        sessionId: input.sessionId,
        turnId: input.turnId,
        events,
        finalReply,
        contextSnapshot,
        status: "completed"
      };

      if (!finalReply) {
        return {
          ...outcome,
          status: "failed",
          error: {
            code: "NO_FINAL_REPLY",
            message: "Model provider did not return a final reply."
          }
        };
      }

      return outcome;
    }
  };
}

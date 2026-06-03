import type {
  AgentToolPreview,
  AgentToolRecentEvent,
  AgentToolStats,
  LlmUsagePayload,
  SessionEvent,
  SubAgentRunStatus,
  SubAgentTranscriptRef,
} from "@actspace/shared";
import { resolveModelSpecByApiModel } from "@actspace/shared";
import type { ToolResult } from "../../../internal-tools";
import type { LLMService } from "../../../llm/types";
import type { Message, ToolResultMessage, UserMessage } from "../../../messages";
import { MessagePriority, getMessageText, getTextContent } from "../../../messages";
import { ContextManager } from "../../../context/manager";
import { SystemPromptContext } from "../../../context/modules/system-prompt";
import { runAgentLoop } from "../../../engine/loop";
import type { AgentEvent, LLMUsageCall } from "../../../engine/types";
import { createPersistedSessionEvent, messageToEvents, userMessageToEvents } from "../../../adapters";
import { calculateUsageCost } from "../../../usage";
import { ToolManager } from "../../manager";
import type { ToolManagerConfig } from "../../types";
import { readFileDefinition } from "../read-file/definition";
import { readFileExecutor } from "../read-file/executor";
import { grepDefinition } from "../grep/definition";
import { grepExecutor } from "../grep/executor";
import { globDefinition } from "../glob/definition";
import { globExecutor } from "../glob/executor";
import { listDirectoryDefinition } from "../list-directory/definition";
import { listDirectoryExecutor } from "../list-directory/executor";
import { EXPLORE_SUBAGENT_SYSTEM_PROMPT } from "./explore-prompt";

export type AgentToolInput = {
  description: string;
  prompt: string;
  subagent_type?: "explore";
};

export type AgentToolOutput = {
  status: Exclude<SubAgentRunStatus, "running">;
  description: string;
  subagentType: "explore";
  summary: string;
  transcriptRef: SubAgentTranscriptRef;
  stats: AgentToolStats;
  transcriptEvents: SessionEvent[];
  uiPreview: AgentToolPreview;
  modelOutput: string;
};

export type SubAgentEventSink = (event: {
  toolCallId?: string;
  transcriptRef: SubAgentTranscriptRef;
  event: SessionEvent;
  preview: AgentToolPreview;
}) => Promise<void> | void;

export type AgentToolRuntime = {
  llm: LLMService;
  workspaceRoot: string;
  sessionId?: string;
  turnId?: string;
  contextWindow?: number;
};

type RunExploreSubAgentInput = {
  args: AgentToolInput;
  runtime: AgentToolRuntime;
  parentSignal?: AbortSignal;
  parentToolCallId?: string;
  eventSink?: SubAgentEventSink;
};

type TranscriptState = {
  events: SessionEvent[];
  recentEvents: AgentToolRecentEvent[];
};

export function createExploreToolManager(config: Pick<ToolManagerConfig, "workspaceRoot" | "summarizer">): ToolManager {
  const manager = new ToolManager({
    workspaceRoot: config.workspaceRoot,
    summarizer: config.summarizer,
  });
  manager.registerFromSpec(readFileDefinition, readFileExecutor);
  manager.registerFromSpec(grepDefinition, grepExecutor);
  manager.registerFromSpec(globDefinition, globExecutor);
  manager.registerFromSpec(listDirectoryDefinition, listDirectoryExecutor);
  return manager;
}

export async function runExploreSubAgent(input: RunExploreSubAgentInput): Promise<AgentToolOutput> {
  const startedAt = Date.now();
  const runId = createRunId();
  const sessionId = input.runtime.sessionId ?? "session";
  const parentTurnId = input.runtime.turnId ?? "turn";
  const transcriptTurnId = `${parentTurnId}:subagent:${runId}`;
  const transcriptRef: SubAgentTranscriptRef = {
    kind: "subagent_transcript",
    sessionId,
    turnId: parentTurnId,
    runId,
  };
  const transcript: TranscriptState = { events: [], recentEvents: [] };
  const toolCalls = new Map<string, { toolName: string; args: Record<string, unknown> }>();
  const exploredFiles = new Set<string>();

  const systemPromptModule = new SystemPromptContext(EXPLORE_SUBAGENT_SYSTEM_PROMPT);
  const contextManager = new ContextManager({
    systemPromptModule,
    config: input.runtime.contextWindow ? { contextWindow: input.runtime.contextWindow } : undefined,
  });
  const subToolManager = createExploreToolManager({ workspaceRoot: input.runtime.workspaceRoot });
  const userMessage: UserMessage = {
    role: "user",
    content: input.args.prompt,
    timestamp: startedAt,
    source: "subagent",
    priority: MessagePriority.HIGH,
  };
  contextManager.appendMessage(userMessage);
  contextManager.setTools(subToolManager.getToolDefinitions());

  for (const event of userMessageToEvents(userMessage, sessionId, transcriptTurnId)) {
    await appendTranscriptEvent({
      event,
      transcript,
      transcriptRef,
      description: input.args.description,
      status: "running",
      sink: input.eventSink,
      parentToolCallId: input.parentToolCallId,
    });
  }

  let status: AgentToolOutput["status"] = "completed";
  let summary = "";
  let usageCalls: LLMUsageCall[] = [];
  let finalMessages: Message[] = [];
  let usageCallIndex = 0;

  try {
    const result = await runAgentLoop(
      contextManager.getContext(),
      input.runtime.llm,
      {
        toolManager: subToolManager,
        toolExecution: "sequential",
        maxTurns: 100,
      },
      async (event) => {
        trackSubAgentEvent(event, toolCalls, exploredFiles);
        await appendEventsFromAgentEvent({
          event,
          sessionId,
          transcriptTurnId,
          transcriptRef,
          transcript,
          description: input.args.description,
          usageCallId: `subagent_${runId}_llm_${++usageCallIndex}`,
          sink: input.eventSink,
          parentToolCallId: input.parentToolCallId,
        });
      },
      input.parentSignal,
    );
    usageCalls = result.usageCalls;
    finalMessages = result.messages;
    if (result.message.stopReason === "aborted") {
      status = "aborted";
    } else if (result.message.stopReason === "error") {
      status = "failed";
    }
    summary = getTextContent(result.message).trim() || "Explore SubAgent completed without a text summary.";
  } catch (error) {
    status = input.parentSignal?.aborted ? "aborted" : "failed";
    summary = error instanceof Error ? error.message : String(error);
    const errorEvent = createPersistedSessionEvent(sessionId, transcriptTurnId, "error", {
      code: status === "aborted" ? "SUBAGENT_ABORTED" : "SUBAGENT_ERROR",
      message: summary,
      recoverable: status !== "aborted",
    });
    await appendTranscriptEvent({
      event: errorEvent,
      transcript,
      transcriptRef,
      description: input.args.description,
      status,
      sink: input.eventSink,
      parentToolCallId: input.parentToolCallId,
    });
  }

  if (status === "aborted" && !transcript.events.some((event) => event.type === "error")) {
    const abortedEvent = createPersistedSessionEvent(sessionId, transcriptTurnId, "error", {
      code: "SUBAGENT_ABORTED",
      message: "SubAgent run was aborted.",
      recoverable: false,
    });
    await appendTranscriptEvent({
      event: abortedEvent,
      transcript,
      transcriptRef,
      description: input.args.description,
      status,
      sink: input.eventSink,
      parentToolCallId: input.parentToolCallId,
    });
  }

  const durationMs = Date.now() - startedAt;
  const stats: AgentToolStats = {
    durationMs,
    toolCallCount: toolCalls.size,
    ...(exploredFiles.size > 0 ? { exploredFileCount: exploredFiles.size } : {}),
    totalTokens: usageCalls.reduce((total, call) => total + call.usage.totalTokens, 0),
  };
  const uiPreview = createAgentPreview({
    description: input.args.description,
    status,
    summary,
    transcriptRef,
    stats,
    recentEvents: transcript.recentEvents,
    error: status === "failed" ? summary : undefined,
  });
  const modelOutput = formatModelOutput({
    status,
    description: input.args.description,
    summary,
    transcriptRef,
    stats,
    finalMessages,
  });

  return {
    status,
    description: input.args.description,
    subagentType: "explore",
    summary,
    transcriptRef,
    stats,
    transcriptEvents: transcript.events,
    uiPreview,
    modelOutput,
  };
}

export function parseAgentToolInput(args: Record<string, unknown>): AgentToolInput | null {
  const description = typeof args.description === "string" ? args.description.trim() : "";
  const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
  const subagentType = typeof args.subagent_type === "string" ? args.subagent_type : "explore";
  if (!description || !prompt || subagentType !== "explore") {
    return null;
  }
  return { description, prompt, subagent_type: "explore" };
}

export function resultFromAgentToolOutput(output: AgentToolOutput): ToolResult {
  return {
    success: output.status === "completed",
    data: output.modelOutput,
    error: output.status === "completed" ? undefined : output.summary,
    outputRef: {
      kind: "inline",
      value: JSON.stringify({
        status: output.status,
        description: output.description,
        subagentType: output.subagentType,
        summary: output.summary,
        transcriptRef: output.transcriptRef,
        stats: output.stats,
        uiPreview: output.uiPreview,
      }),
    },
    subagent: {
      transcriptRef: output.transcriptRef,
      transcriptEvents: output.transcriptEvents,
      uiPreview: output.uiPreview,
    },
  };
}

function createRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createAgentPreview(input: {
  description: string;
  status: SubAgentRunStatus;
  summary?: string;
  transcriptRef?: SubAgentTranscriptRef;
  stats?: AgentToolStats;
  recentEvents?: AgentToolRecentEvent[];
  error?: string;
}): AgentToolPreview {
  return {
    kind: "agent",
    description: input.description,
    status: input.status,
    subagentType: "explore",
    displayText: input.description,
    summary: input.summary,
    transcriptRef: input.transcriptRef,
    stats: input.stats,
    recentEvents: input.recentEvents,
    error: input.error,
  };
}

async function appendEventsFromAgentEvent(input: {
  event: AgentEvent;
  sessionId: string;
  transcriptTurnId: string;
  transcriptRef: SubAgentTranscriptRef;
  transcript: TranscriptState;
  description: string;
  usageCallId: string;
  sink?: SubAgentEventSink;
  parentToolCallId?: string;
}): Promise<void> {
  if (input.event.type !== "message_end") return;

  const messageEvents = messageToEvents(input.event.message, input.sessionId, input.transcriptTurnId);
  for (const event of messageEvents) {
    await appendTranscriptEvent({
      event,
      transcript: input.transcript,
      transcriptRef: input.transcriptRef,
      description: input.description,
      status: "running",
      sink: input.sink,
      parentToolCallId: input.parentToolCallId,
    });
  }

  if (input.event.message.role === "assistant") {
    await appendTranscriptEvent({
      event: createLlmUsageEvent(
        input.event.message,
        input.sessionId,
        input.transcriptTurnId,
        input.usageCallId,
        messageEvents.map((event) => event.id),
      ),
      transcript: input.transcript,
      transcriptRef: input.transcriptRef,
      description: input.description,
      status: "running",
      sink: input.sink,
      parentToolCallId: input.parentToolCallId,
    });
  }
}

function createLlmUsageEvent(
  message: Extract<Message, { role: "assistant" }>,
  sessionId: string,
  turnId: string,
  callId: string,
  relatedEventIds: string[],
): SessionEvent<LlmUsagePayload> {
  const provider = message.provider;
  const modelSpec = resolveModelSpecByApiModel(
    message.model,
    provider === "deepseek" || provider === "kimi" ? provider : undefined,
  );
  const payload: LlmUsagePayload = {
    callId,
    provider,
    model: message.model,
    modelId: modelSpec?.id,
    promptTokens: message.usage.input,
    completionTokens: message.usage.output,
    totalTokens: message.usage.totalTokens,
    reasoningTokens: message.usage.reasoning || undefined,
    cacheHitTokens: message.usage.cacheHit || message.usage.cacheRead || undefined,
    cacheMissTokens: message.usage.cacheMiss || undefined,
    serverToolUse: message.usage.serverToolUse,
    cost: calculateUsageCost(
      {
        inputTokens: message.usage.input,
        outputTokens: message.usage.output,
        totalTokens: message.usage.totalTokens,
        reasoningTokens: message.usage.reasoning,
        cacheHitTokens: message.usage.cacheHit || message.usage.cacheRead,
        cacheMissTokens: message.usage.cacheMiss,
      },
      modelSpec?.pricing,
    ),
    relatedEventIds,
  };
  return createPersistedSessionEvent(sessionId, turnId, "llm_usage", payload);
}

async function appendTranscriptEvent(input: {
  event: SessionEvent;
  transcript: TranscriptState;
  transcriptRef: SubAgentTranscriptRef;
  description: string;
  status: SubAgentRunStatus;
  sink?: SubAgentEventSink;
  parentToolCallId?: string;
}): Promise<void> {
  input.transcript.events.push(input.event);
  const recentEvent = summarizeTranscriptEvent(input.event);
  if (recentEvent) {
    input.transcript.recentEvents = [...input.transcript.recentEvents, recentEvent].slice(-5);
  }
  await input.sink?.({
    toolCallId: input.parentToolCallId,
    transcriptRef: input.transcriptRef,
    event: input.event,
    preview: createAgentPreview({
      description: input.description,
      status: input.status,
      transcriptRef: input.transcriptRef,
      recentEvents: input.transcript.recentEvents,
    }),
  });
}

function summarizeTranscriptEvent(event: SessionEvent): AgentToolRecentEvent | null {
  switch (event.type) {
    case "user_message":
      return {
        id: event.id,
        type: event.type,
        title: "Prompt",
        summary: summarizePayloadText(event.payload, "content"),
        timestamp: event.timestamp,
      };
    case "thinking":
      return {
        id: event.id,
        type: event.type,
        title: "Thinking",
        summary: summarizePayloadText(event.payload, "content"),
        timestamp: event.timestamp,
      };
    case "tool_call": {
      const payload = event.payload as { name?: string; arguments?: Record<string, unknown> };
      return {
        id: event.id,
        type: event.type,
        title: payload.name ?? "Tool",
        summary: summarizeToolArgs(payload.name ?? "tool", payload.arguments ?? {}),
        timestamp: event.timestamp,
      };
    }
    case "tool_result": {
      const payload = event.payload as { summary?: string; toolName?: string; ok?: boolean; modelOutput?: string };
      return {
        id: event.id,
        type: event.type,
        title: payload.toolName ?? "Tool result",
        summary: payload.summary ?? truncate(payload.modelOutput ?? "Tool result"),
        timestamp: event.timestamp,
        isError: payload.ok === false,
      };
    }
    case "assistant_message":
    case "assistant_reply":
      return {
        id: event.id,
        type: event.type,
        title: "Report",
        summary: summarizePayloadText(event.payload, "content"),
        timestamp: event.timestamp,
      };
    case "error": {
      const payload = event.payload as { message?: string };
      return {
        id: event.id,
        type: event.type,
        title: "Error",
        summary: truncate(payload.message ?? "SubAgent error"),
        timestamp: event.timestamp,
        isError: true,
      };
    }
    default:
      return null;
  }
}

function summarizePayloadText(payload: unknown, key: string): string {
  if (typeof payload === "object" && payload && key in payload) {
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value === "string") return truncate(value);
  }
  return "";
}

function summarizeToolArgs(toolName: string, args: Record<string, unknown>): string {
  const path = typeof args.path === "string" ? args.path : undefined;
  if (toolName === "read_file" && path) return `Read ${path}`;
  if (toolName === "list_directory" && path) return `List ${path}`;
  if (toolName === "grep") return `Grep ${typeof args.pattern === "string" ? args.pattern : "pattern"}${path ? ` in ${path}` : ""}`;
  if (toolName === "glob") return `Glob ${typeof args.pattern === "string" ? args.pattern : "pattern"}${path ? ` in ${path}` : ""}`;
  return truncate(JSON.stringify(args));
}

function trackSubAgentEvent(
  event: AgentEvent,
  toolCalls: Map<string, { toolName: string; args: Record<string, unknown> }>,
  exploredFiles: Set<string>,
): void {
  if (event.type !== "tool_start") return;
  toolCalls.set(event.toolCallId, { toolName: event.toolName, args: event.args });
  const path = typeof event.args.path === "string" ? event.args.path : undefined;
  if (path && (event.toolName === "read_file" || event.toolName === "list_directory" || event.toolName === "grep" || event.toolName === "glob")) {
    exploredFiles.add(path);
  }
}

function formatModelOutput(input: {
  status: AgentToolOutput["status"];
  description: string;
  summary: string;
  transcriptRef: SubAgentTranscriptRef;
  stats: AgentToolStats;
  finalMessages: Message[];
}): string {
  const evidence = extractEvidence(input.finalMessages);
  return [
    `SubAgent run: ${input.description}`,
    `Status: ${input.status}`,
    `Summary: ${input.summary}`,
    evidence ? `Evidence:\n${evidence}` : undefined,
    `TranscriptRef: ${JSON.stringify(input.transcriptRef)}`,
    `Stats: ${input.stats.toolCallCount} tools, ${input.stats.durationMs}ms${input.stats.exploredFileCount ? `, ${input.stats.exploredFileCount} explored files` : ""}`,
  ].filter(Boolean).join("\n");
}

function extractEvidence(messages: Message[]): string {
  const toolResults = messages
    .filter((message): message is ToolResultMessage => message.role === "toolResult")
    .slice(0, 6)
    .map((message) => `- ${message.toolName}: ${truncate(getMessageText(message), 120)}`);
  return toolResults.join("\n");
}

function truncate(text: string, limit = 180): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

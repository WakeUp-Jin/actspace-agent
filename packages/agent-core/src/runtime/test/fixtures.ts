import type { AgentRunResult, RuntimeStreamEvent, SessionEvent } from "@actspace/shared";
import type { AgentDeps } from "../../engine/create-agent-deps";
import type { RuntimeAgentRunRequest, RuntimeInteractionMode, RuntimePersistenceMode } from "../types";

export type HostFixtureProfile = {
  name: "desktop" | "cli-headless" | "cli-interactive";
  persistenceMode: RuntimePersistenceMode;
  interactionMode: RuntimeInteractionMode;
};

export const HOST_FIXTURE_PROFILES: HostFixtureProfile[] = [
  { name: "desktop", persistenceMode: "persistent", interactionMode: "desktop" },
  { name: "cli-headless", persistenceMode: "ephemeral", interactionMode: "cli-headless" },
  { name: "cli-interactive", persistenceMode: "persistent", interactionMode: "cli-interactive" },
];

export function createHostFixtureRequest(root: string, profile: HostFixtureProfile): RuntimeAgentRunRequest {
  return {
    sessionId: `session-${profile.name}`,
    agentRunId: `run-${profile.name}`,
    userInput: "hello",
    workspaceRoot: `${root}/workspace`,
    roots: {
      dataRoot: root,
      sessionRoot: `${root}/sessions`,
      tmpRoot: `${root}/tmp`,
      defaultWorkspaceRoot: `${root}/workspace`,
    },
    persistenceMode: profile.persistenceMode,
    interactionMode: profile.interactionMode,
    mode: "agent",
  };
}

export function createHostFixtureDeps(): AgentDeps {
  return {
    llm: {} as AgentDeps["llm"],
    toolManager: { dispose: async () => {} } as AgentDeps["toolManager"],
    contextManager: {
      getMessageCount: () => 0,
      getUsageSnapshot: () => ({ totalTokens: 1 }),
    } as AgentDeps["contextManager"],
    thinkingEnabled: false,
    modelSpec: { contextWindow: 100_000 } as AgentDeps["modelSpec"],
    modelDefinition: {
      provider: "mock",
      apiModel: "mock-model",
      capabilities: { input: ["text"] },
    } as AgentDeps["modelDefinition"],
    modelKey: "mock:model",
  };
}

export function createHostFixtureResult(
  request: RuntimeAgentRunRequest,
  status: AgentRunResult["status"] = "completed",
): AgentRunResult {
  const events: SessionEvent[] = status === "completed"
    ? [sessionEvent(request, "assistant_message", { content: "ok" })]
    : status === "failed"
      ? [sessionEvent(request, "error", { code: "TEST_FAILED", message: "failed" })]
      : [sessionEvent(request, "agent_run_aborted", {})];
  return {
    sessionId: request.sessionId,
    agentRunId: request.agentRunId,
    events,
    contextSnapshot: { totalTokens: 1 } as AgentRunResult["contextSnapshot"],
    status,
    ...(status === "failed" ? { error: { code: "TEST_FAILED", message: "failed" } } : {}),
  };
}

export function eventTypes(events: RuntimeStreamEvent[]): string[] {
  return events.map((event) => event.type);
}

function sessionEvent(
  request: RuntimeAgentRunRequest,
  type: SessionEvent["type"],
  payload: unknown,
): SessionEvent {
  return {
    id: `${request.agentRunId}-${type}`,
    sessionId: request.sessionId,
    agentRunId: request.agentRunId,
    type,
    timestamp: new Date(0).toISOString(),
    schemaVersion: 2,
    payload,
  };
}

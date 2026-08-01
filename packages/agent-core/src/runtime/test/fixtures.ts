import type { AgentTurnResult, RuntimeStreamEvent, SessionEvent } from "@actspace/shared";
import type { AgentDeps } from "../../engine/create-agent-deps";
import type { RuntimeInteractionMode, RuntimePersistenceMode, RuntimeTurnRequest } from "../types";

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

export function createHostFixtureRequest(root: string, profile: HostFixtureProfile): RuntimeTurnRequest {
  return {
    sessionId: `session-${profile.name}`,
    turnId: `turn-${profile.name}`,
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
  request: RuntimeTurnRequest,
  status: AgentTurnResult["status"] = "completed",
): AgentTurnResult {
  const events: SessionEvent[] = status === "completed"
    ? [sessionEvent(request, "assistant_message", { content: "ok" })]
    : status === "failed"
      ? [sessionEvent(request, "error", { code: "TEST_FAILED", message: "failed" })]
      : [sessionEvent(request, "turn_aborted", {})];
  return {
    sessionId: request.sessionId,
    turnId: request.turnId,
    events,
    contextSnapshot: { totalTokens: 1 } as AgentTurnResult["contextSnapshot"],
    status,
    ...(status === "failed" ? { error: { code: "TEST_FAILED", message: "failed" } } : {}),
  };
}

export function eventTypes(events: RuntimeStreamEvent[]): string[] {
  return events.map((event) => event.type);
}

function sessionEvent(
  request: RuntimeTurnRequest,
  type: SessionEvent["type"],
  payload: unknown,
): SessionEvent {
  return {
    id: `${request.turnId}-${type}`,
    sessionId: request.sessionId,
    turnId: request.turnId,
    type,
    timestamp: new Date(0).toISOString(),
    payload,
  };
}

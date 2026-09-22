import { MAIN_AGENT_DESCRIPTOR, MainAgentInbox } from "@actspace/core-agent";
import { AgentScope } from "@actspace/core-scope";
import { createCoreCodecRegistry, createSessionHeader } from "@actspace/session-journal";
import { SessionHandle } from "@actspace/session-persistence";
import { RequestAssembler } from "@actspace/prompt";
import { LlmRouteRegistry, LlmService, EMPTY_LLM_USAGE, type LlmStreamEvent } from "@actspace/llm-service";
import { ToolRuntime, type ToolBodyResult, type ToolPolicy } from "@actspace/tools-runtime";
import type { CordisContext } from "@actspace/cordis-adapter";
import { AgentLoop, type AgentLoopLiveEvent } from "./loop.js";

/** Same real loop fixture is consumed by Core, Main adapter and renderer regressions. */
export async function runToolStreamFixture(options: {
  subagent?: boolean;
  onTools?: (tools: readonly import("@actspace/llm-service").LlmToolDefinition[]) => void;
  deltas?: boolean;
  resolveArtifact?: import("@actspace/tools-runtime").SessionArtifactResolver;
  thinkingEnabled?: boolean;
  reasoningEffort?: import("@actspace/shared").ModelReasoningEffort;
  onRequest?: (options: import("@actspace/llm-service").LlmRequestOptions) => void;
  onMessages?: (messages: readonly import("@actspace/llm-service").LlmMessage[]) => void;
  onJournal?: (events: readonly import("@actspace/session-journal").SessionEventEnvelopeV1[]) => void;
  args?: string;
  sessionId?: string;
  agentRunId?: string;
  onLiveEvent?: (event: AgentLoopLiveEvent) => void;
  execute?: () => Promise<ToolBodyResult>;
  policies?: readonly ToolPolicy[];
  beforeFinalText?: () => Promise<void>;
  context?: CordisContext;
} = {}) {
  const registry = createCoreCodecRegistry();
  const session = SessionHandle.createEphemeral({ registry, header: createSessionHeader({
    sessionId: options.sessionId ?? "tool-stream-test", createdAt: "2026-09-06T00:00:00.000Z", lineage: options.subagent ? { origin: "delegation", parentSessionId: "parent", parentCallId: "delegate", parentBoundarySeq: 0, seedDigest: "fixture", delegationDepth: 1 } : null,
    createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest },
  }) });
  const tools = new ToolRuntime();
  tools.register({ definition: { abiVersion: 2, pluginId: "test.tools", name: "read_file", definitionVersion: 1,
    description: "Read fixture", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
    effects: [], concurrency: "read-only", sensitiveArgumentPaths: [], resultSchemaVersion: 1 },
    policies: options.policies,
    executor: { concurrencySafe: true, execute: options.execute ?? (async () => ({ status: "completed", summary: "Read fixture.txt", modelOutput: [{ type: "text", text: "fixture content" }] })) } });
  let requests = 0;
  const args = options.args ?? '{"path":"fixture.txt"}';
  const routes = new LlmRouteRegistry();
  const handle = routes.register({ routeId: "test", providerId: "test", modelPattern: "*", credentialRef: "test", defaults: {}, adapter: {
    adapterVersion: "test", dispatch: async (input) => (async function* (): AsyncGenerator<LlmStreamEvent> {
      options.onRequest?.(input.request.options);
      options.onTools?.(input.request.tools);
      options.onMessages?.(input.request.messages);
      if (requests++ === 0) {
        yield { type: "text-delta", text: "Read now. " };
        if (options.deltas !== false) {
          yield { type: "tool-call-delta", callId: "read-1", name: "read_file", argumentsDelta: args.slice(0, 8) };
          yield { type: "tool-call-delta", callId: "read-1", name: "read_file", argumentsDelta: args.slice(8) };
        }
        yield { type: "done", stopReason: "tool-use", usage: EMPTY_LLM_USAGE, content: [{ type: "text", text: "Read now. " }, { type: "tool-call", callId: "read-1", name: "read_file", arguments: args }] };
      } else {
        await options.beforeFinalText?.();
        yield { type: "text-delta", text: 'Done. {"valid":"body JSON"}' };
        yield { type: "done", stopReason: "stop", usage: EMPTY_LLM_USAGE, content: [{ type: "text", text: 'Done. {"valid":"body JSON"}' }] };
      }
    })(),
  } });
  const events: AgentLoopLiveEvent[] = [];
  const loop = new AgentLoop({ session, tools, inbox: new MainAgentInbox(session),
    descriptor: { ...MAIN_AGENT_DESCRIPTOR, ...(options.subagent ? { kind: "subagent" as const, maxSteps: 2 } : {}), routeId: "test", model: "test" }, scope: new AgentScope("main:test", undefined, "main:test"),
    assembler: new RequestAssembler({ prepare: () => { throw new Error("not used"); } }),
    llm: new LlmService(routes, { resolve: async () => ({ apiKey: "fixture" }) }),
    compositionDigest: "test", hostCapabilityDigest: "test", host: { hostKind: "desktop", capabilityCeiling: [], runtimeContract: "actspace.runtime.v2", invocationId: "test", workspaceRef: "/fixture" },
    toolEnvironment: () => ({ resolveArtifact: options.resolveArtifact, workspaceRoot: "/fixture", hostCapabilities: new Set(), capabilitySet: { ids: [], has: () => false, get: () => { throw new Error("not used"); } }, createArtifact: async () => { throw new Error("not used"); } }),
    onLiveEvent: (event) => { events.push(event); options.onLiveEvent?.(event); },
    context: options.context,
  });
  try {
    const result = await loop.runTurn({ content: "Read fixture", thinkingEnabled: options.thinkingEnabled, reasoningEffort: options.reasoningEffort, agentRunId: options.agentRunId ?? "run-test" });
    return { result, events, journal: [...session.journal.events], header: session.header, registry };
  } finally { options.onJournal?.([...session.journal.events]); await session.close(); await handle.dispose(100); }
}

import { describe, expect, it, vi } from "vitest";
import { createCordisRoot, emitContained } from "@actspace/cordis-adapter";
import { AgentScope } from "@actspace/core-scope";
import { MAIN_AGENT_DESCRIPTOR, MainAgentInbox, type AgentHandle } from "@actspace/core-agent";
import { AgentLoop } from "@actspace/core-agent-loop";
import { RequestAssembler } from "@actspace/prompt";
import { createCoreCodecRegistry, createSessionHeader } from "@actspace/session-journal";
import { SessionHandle } from "@actspace/session-persistence";
import { LlmRouteRegistry, LlmService, EMPTY_LLM_USAGE, type LlmMessage, type LlmStreamEvent } from "@actspace/llm-service";
import { ToolRuntime } from "@actspace/tools-runtime";
import { EnglishLearningService } from "@actspace/english-learning";
import { DEFAULT_SPEECH_SETTINGS } from "@actspace/shared";

describe("English learning real AgentLoop integration", () => {
  it("keeps Provider messages and Journal snapshots scoped while speaking only newly completed English", async () => {
    const root = await createCordisRoot();
    const registry = createCoreCodecRegistry();
    const routes = new LlmRouteRegistry();
    const observed = new Map<string, readonly LlmMessage[]>();
    const route = routes.register({ routeId: "fixture", providerId: "fixture", modelPattern: "*", credentialRef: "fixture", defaults: {}, adapter: {
      adapterVersion: "fixture",
      dispatch: async (input) => (async function* (): AsyncGenerator<LlmStreamEvent> {
        observed.set(input.request.sessionId!, input.request.messages);
        yield { type: "text-delta", text: "A clear explanation.\n清晰的解释。" };
        yield { type: "done", stopReason: "stop", usage: EMPTY_LLM_USAGE, content: [{ type: "text", text: "A clear explanation.\n清晰的解释。" }] };
      })(),
    } });
    const sessions: SessionHandle[] = [];
    const scopes: AgentScope[] = [];
    const syntheses: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (_url, init) => {
      syntheses.push(JSON.parse(String(init?.body)).text);
      return new Response(JSON.stringify({ base_resp: { status_code: 0 }, data: { audio: "0102" } }));
    });
    const play = vi.fn(async () => {});
    const learning = new EnglishLearningService(root.context, { supported: true, settings: () => ({ ...DEFAULT_SPEECH_SETTINGS }), resolveCredential: () => "speech-canary", play, stop: async () => {}, subscribeSettings: () => () => {} });
    const create = (id: string) => {
      const session = SessionHandle.createEphemeral({ registry, header: createSessionHeader({ sessionId: id, createdAt: "2026-09-06T00:00:00Z", lineage: null, createdWith: { profileId: "fixture", runtimeContractVersion: "1", manifestDigest: "fixture", plugins: [], codecSetDigest: registry.digest } }), onEvent: (event) => emitContained(root.context, "session/event", event, { sessionId: id }) });
      const scope = new AgentScope(`main:${id}`); scopes.push(scope); sessions.push(session);
      const descriptor = { ...MAIN_AGENT_DESCRIPTOR, routeId: "fixture", model: "fixture" };
      const agent: AgentHandle = { agentId: scope.agentId, scope, descriptor, session, dispose: () => scope.dispose() };
      const loop = new AgentLoop({ scope, session, descriptor, context: root.context, inbox: new MainAgentInbox(session), tools: new ToolRuntime(), assembler: new RequestAssembler({ prepare: () => { throw new Error("unused"); } }), llm: new LlmService(routes, { resolve: async () => ({ apiKey: "model-canary" }) }), compositionDigest: "fixture", hostCapabilityDigest: "fixture", host: { hostKind: "desktop", invocationId: "test", runtimeContract: "actspace.runtime.v2", capabilityCeiling: [] }, toolEnvironment: () => ({ workspaceRoot: "/same-workspace", hostCapabilities: new Set(), capabilitySet: { ids: [], has: () => false, get: () => { throw new Error("unused"); } }, createArtifact: async () => { throw new Error("unused"); } }) });
      return { agent, loop, session };
    };
    const a = create("a"); const b = create("b");
    try {
      await learning.enable(a.agent);
      await Promise.all([a.loop.runTurn({ content: "请解释" }), b.loop.runTurn({ content: "请解释" })]);
      await Promise.all(sessions.map((session) => session.flush()));
      await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(1));
      expect(syntheses).toEqual(["A clear explanation."]);
      expect(JSON.stringify(observed.get("a"))).toContain("english-learning/v1");
      expect(JSON.stringify(observed.get("b"))).not.toContain("english-learning/v1");
      const snapshot = a.session.journal.events.find((event) => event.type === "request/context");
      expect(JSON.stringify(snapshot)).toContain("english-learning/v1");
      expect(JSON.stringify(a.session.journal.events)).not.toContain("speech-canary");
      // Replayed terminal events and closing the mode cannot speak old content.
      for (const event of a.session.journal.events.filter((event) => event.type === "turn/end")) await emitContained(root.context, "session/event", event, { sessionId: "a" });
      await learning.disable();
      await a.loop.runTurn({ content: "继续" }); await a.session.flush();
      expect(observed.get("a")?.filter((message) => message.role === "system").some((message) => JSON.stringify(message).includes("english-learning/v1"))).toBe(false);
      expect(play).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
      await learning.dispose();
      await Promise.all(scopes.map((scope) => scope.dispose()));
      await Promise.all(sessions.map((session) => session.close()));
      await route.dispose(100); await root.dispose();
    }
  });
});

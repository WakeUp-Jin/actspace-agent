import { ContextEngine, ContextSourceRegistry } from "@actspace/context-engine";
import { describe, expect, it, vi } from "vitest";
import { createCordisRoot, emitNotification } from "@actspace/cordis-adapter";
import { AgentScope } from "@actspace/core-scope";
import { MAIN_AGENT_DESCRIPTOR, type AgentHandle } from "@actspace/core-agent";
import { RequestAssembler, PromptExtensionRegistry, contextFromCandidate } from "@actspace/prompt";
import { DEFAULT_SPEECH_SETTINGS } from "@actspace/shared";
import { EnglishLearningService } from "../service.js";
import { injectEnglishLearning, PROMPT_ID } from "../prompt.js";
import { manifest } from "../manifest.js";
import { apply } from "../plugin.js";
import type { SpeechHostPort } from "../host-port.js";

export function fakeHost(): SpeechHostPort {
  return { supported: true, settings: () => ({ ...DEFAULT_SPEECH_SETTINGS }), resolveCredential: () => undefined, play: vi.fn(async () => {}), stop: vi.fn(async () => {}), subscribeSettings: () => () => {} };
}

describe("English learning lifecycle and scoped prompt", () => {
  it("enables an idle Session without a live Run Agent", async () => {
    const root = await createCordisRoot();
    const extensions = new PromptExtensionRegistry();
    root.context.provide?.("actspace.host.prompt", { extensions });
    root.context.provide?.("agent.registry", { list: () => [] });
    root.context.provide?.("session.runtime", { getOpen: (id: string) => id === "idle" ? { header: { sessionId: id, lineage: null }, journal: { lastSeq: -1, events: [] } } : undefined });
    const service = new EnglishLearningService(root.context, fakeHost());
    try {
      await expect(service.enableSession("idle")).resolves.toMatchObject({ enabled: true, targetSessionId: "idle" });
    } finally { await service.dispose(); await root.dispose(); }
  });
  it("releases host subscriptions and playback with its owning Cordis effect", async () => {
    const root = await createCordisRoot();
    const host = fakeHost();
    const unsubscribe = vi.fn();
    host.subscribeSettings = () => unsubscribe;
    root.context.provide?.("actspace.host.speech", host);
    await root.mount("learning-test", ({ context }) => { apply(context!); });
    const service = root.getService<EnglishLearningService>("english-learning");
    expect(service?.getState()).toMatchObject({ enabled: false, speechStatus: "unconfigured" });
    await root.dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(host.stop).toHaveBeenCalled();
    await root.dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("is a real optional plugin and stays dormant without desktop speech", () => {
    expect(manifest.behaviors[0].entryId).toBe("english-learning");
    expect(manifest.codecs).toEqual([]);
    const provide = vi.fn();
    apply({ get: () => undefined, provide });
    expect(provide).not.toHaveBeenCalled();
  });

  it("only injects target main requests, excludes child and sibling, and releases bindings", async () => {
    const root = await createCordisRoot();
    const extensions = new PromptExtensionRegistry();
    root.context.provide?.("actspace.host.prompt", { workspaceRoot: "/fixture", extensions });
    const service = new EnglishLearningService(root.context, fakeHost());
    const a = new AgentScope("main:a"); const b = new AgentScope("main:b"); const child = a.child("child");
    const handle = (scope: AgentScope, id: string) => ({ agentId: scope.agentId, descriptor: MAIN_AGENT_DESCRIPTOR, scope, session: { header: { sessionId: id, lineage: null }, journal: { lastSeq: -1, events: [] } }, dispose: () => scope.dispose() }) as unknown as AgentHandle;
    const assembler = new RequestAssembler({ prepare: () => { throw new Error("not used"); } });
    const assemble = async (scope: AgentScope, id: string) => {
      const candidate = await assembler.assembleCandidate({ scope, sessionId: id, turnId: "turn", stepId: "step", surface: [], hostFacts: {}, selectedSkillIds: [] }, [], {});
      const engine = new ContextEngine({ resolve: request => contextFromCandidate(request, candidate, { entries: [], replaceGeneration: 0 }, -1), sources: new ContextSourceRegistry(), extensions: () => extensions.list(id, scope.identity.scopeId, "main") });
      const context = await engine.getContext({ sessionId: id, turnId: "turn", stepId: "step", requestId: "r", routeId: "r", model: "m", options: {} });
      const input = await engine.toLlmInput(context);
      return { renderedSystemPrompt: input.messages.filter(value => value.role === "system").map(value => value.content).join(""), contributorProvenance: context.status.plugins["actspace.context.sources"], systemSections: context.content.system.sections };
    };
    try {
      await service.enable(handle(a, "a"));
      const first = await assemble(a, "a");
      expect(first.renderedSystemPrompt).toContain(PROMPT_ID);
      expect(first.contributorProvenance).toContainEqual(expect.objectContaining({ contributorId: PROMPT_ID }));
      expect(first.systemSections.filter(section => section.id === PROMPT_ID)).toHaveLength(1);
      expect((await assemble(b, "b")).renderedSystemPrompt).not.toContain(PROMPT_ID);
      expect((await assemble(child, "child-session")).renderedSystemPrompt).not.toContain(PROMPT_ID);
      await service.enable(handle(b, "b"));
      expect((await assemble(a, "a")).renderedSystemPrompt).not.toContain(PROMPT_ID);
      expect((await assemble(b, "b")).renderedSystemPrompt).toContain(PROMPT_ID);
      await service.stop();
      expect(service.getState().enabled).toBe(true);
      await b.dispose();
      expect(service.getState().enabled).toBe(true);
      expect(extensions.list("b", "next-run", "main")).toHaveLength(1);
      expect(extensions.list("b", "next-run")).toHaveLength(0);
      expect(extensions.list("b", "child-run", "subagent")).toHaveLength(0);
      await service.disable();
      expect(extensions.list("b", "next-run", "main")).toHaveLength(0);
      expect((await assemble(a, "a")).renderedSystemPrompt).not.toContain(PROMPT_ID);
      await service.dispose(); await service.dispose();
      await emitNotification(root.context, "session/event", {}, { sessionId: "a" });
    } finally { await service.dispose(); await a.dispose(); await b.dispose(); await root.dispose(); }
  });
});

import { describe, expect, it, vi } from "vitest";
import { createCordisRoot, emitContained } from "@actspace/cordis-adapter";
import { AgentScope } from "@actspace/core-scope";
import { MAIN_AGENT_DESCRIPTOR, createAgentEventDispatcher, type AgentHandle } from "@actspace/core-agent";
import { RequestAssembler, type LogicalRequestCandidate } from "@actspace/prompt";
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
    const service = new EnglishLearningService(root.context, fakeHost());
    const a = new AgentScope("main:a"); const b = new AgentScope("main:b"); const child = a.child("child");
    const handle = (scope: AgentScope, id: string) => ({ agentId: scope.agentId, descriptor: MAIN_AGENT_DESCRIPTOR, scope, session: { header: { sessionId: id, lineage: null }, journal: { lastSeq: -1, events: [] } }, dispose: () => scope.dispose() }) as unknown as AgentHandle;
    const assembler = new RequestAssembler({ prepare: () => { throw new Error("not used"); } });
    const assemble = async (scope: AgentScope, id: string) => {
      const candidate = await assembler.assembleCandidate({ scope, sessionId: id, turnId: "turn", stepId: "step", surface: [], hostFacts: {}, selectedSkillIds: [] }, [], {});
      return createAgentEventDispatcher(root.context, scope).waterfall<LogicalRequestCandidate>("system-prompt/assemble", candidate);
    };
    try {
      await service.enable(handle(a, "a"));
      const first = await assemble(a, "a");
      expect(first.renderedSystemPrompt).toContain(PROMPT_ID);
      expect(first.contributorProvenance).toContainEqual(expect.objectContaining({ contributorId: PROMPT_ID }));
      expect(injectEnglishLearning(first).systemSections).toEqual(first.systemSections);
      expect((await assemble(b, "b")).renderedSystemPrompt).not.toContain(PROMPT_ID);
      expect((await assemble(child, "child-session")).renderedSystemPrompt).not.toContain(PROMPT_ID);
      await service.enable(handle(b, "b"));
      expect((await assemble(a, "a")).renderedSystemPrompt).not.toContain(PROMPT_ID);
      expect((await assemble(b, "b")).renderedSystemPrompt).toContain(PROMPT_ID);
      await service.stop();
      expect(service.getState().enabled).toBe(true);
      await b.dispose();
      expect(service.getState().enabled).toBe(false);
      expect((await assemble(a, "a")).renderedSystemPrompt).not.toContain(PROMPT_ID);
      await service.dispose(); await service.dispose();
      await emitContained(root.context, "session/event", {}, { sessionId: "a" });
    } finally { await service.dispose(); await a.dispose(); await b.dispose(); await root.dispose(); }
  });
});

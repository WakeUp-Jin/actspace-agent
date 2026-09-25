import { describe, expect, it } from "vitest";
import { AgentScope } from "@actspace/core-scope";
import { RequestAssembler } from "../assembler.js";
import { ContributorRegistry } from "../registry.js";
import type { PromptContributor } from "../contributor.js";

function contributor(id: string, order: number, value: string, criticality: PromptContributor["criticality"] = "required", kind: PromptContributor["kind"] = "prompt-section"): PromptContributor {
  return { id, ownerPluginId: "plugin", scopeId: "root", kind, layer: "plugin", order, criticality, resolve: () => ({ value }) };
}

describe("RequestAssembler", () => {
  it("sorts contributors deterministically and freezes the candidate", async () => {
    const scope = new AgentScope("main", undefined, "root");
    const registry = new ContributorRegistry();
    registry.register(scope, contributor("plugin/z", 1, "z"));
    registry.register(scope, contributor("plugin/a", 1, "a"));
    const assembler = new RequestAssembler({ registry, prepare: async () => ({ route: "openai", model: "model", registrationId: "reg", adapterVersion: "1", defaults: {}, retryPolicy: {} }) });
    const snapshot = await assembler.assemble({ sessionId: "s", turnId: "t", stepId: "p", scope, surface: ["user"], hostFacts: { host: "cli" }, selectedSkillIds: [] }, [{ name: "tool" }], { temperature: 0 }, "composition", "host");
    expect(snapshot.systemSections).toEqual(["a", "z"]);
    expect(snapshot.renderedSystemPrompt).toContain("a\n\nz");
    expect(snapshot.schemaVersion).toBe(2);
    expect(Object.isFrozen(snapshot)).toBe(true);
    await scope.dispose();
  });

  it("keeps request facts auditable without invalidating the stable model prompt", async () => {
    const scope = new AgentScope("main", undefined, "root");
    const registry = new ContributorRegistry();
    registry.register(scope, contributor("plugin/model", 0, "stable", "required", "model-fact"));
    registry.register(scope, contributor("plugin/request", 0, "dynamic", "required", "request-fact"));
    const assembler = new RequestAssembler({ registry, prepare: async () => ({ route: "route", model: "model", registrationId: "reg", adapterVersion: "1", defaults: {}, retryPolicy: {} }) });
    const first = await assembler.assembleCandidate({ sessionId: "s", turnId: "t1", stepId: "p1", scope, surface: [], hostFacts: { agentRunId: "run-1", invocationId: "invoke-1" }, selectedSkillIds: [] }, [], {});
    const second = await assembler.assembleCandidate({ sessionId: "s", turnId: "t2", stepId: "p2", scope, surface: [], hostFacts: { agentRunId: "run-2", invocationId: "invoke-2" }, selectedSkillIds: [] }, [], {});
    expect(first.renderedSystemPrompt).toBe(second.renderedSystemPrompt);
    expect(first.renderedSystemPrompt).toContain("stable");
    expect(first.renderedSystemPrompt).not.toContain("run-1");
    expect(first.facts).toContainEqual({ host: { agentRunId: "run-1", invocationId: "invoke-1" } });
    expect(first.facts).toContain("dynamic");
    expect(first.modelFacts).toEqual(["stable"]);
    await scope.dispose();
  });

  it("skips optional contributor failures but fails required failures", async () => {
    const scope = new AgentScope("main", undefined, "root");
    const registry = new ContributorRegistry();
    registry.register(scope, { ...contributor("plugin/optional", 0, "ignored", "optional"), resolve: () => { throw new Error("optional"); } });
    const assembler = new RequestAssembler({ registry, prepare: async () => ({ route: "route", model: "model", registrationId: "reg", adapterVersion: "1", defaults: {}, retryPolicy: {} }) });
    const snapshot = await assembler.assemble({ sessionId: "s", turnId: "t", stepId: "p", scope, surface: [], hostFacts: {}, selectedSkillIds: [] }, [], {}, "composition", "host");
    expect(snapshot.systemSections).toEqual([]);
    expect(snapshot.contributorProvenance).toEqual([{ contributorId: "plugin/optional", ownerPluginId: "plugin", skipped: true, reason: "resolve-failed" }]);
    registry.register(scope, { ...contributor("plugin/required", 1, "bad"), resolve: () => { throw new Error("required"); } });
    await expect(assembler.assemble({ sessionId: "s", turnId: "t", stepId: "p", scope, surface: [], hostFacts: {}, selectedSkillIds: [] }, [], {}, "composition", "host")).rejects.toThrow("Required contributor");
    await scope.dispose();
  });
});

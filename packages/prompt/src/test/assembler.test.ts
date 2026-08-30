import { describe, expect, it } from "vitest";
import { AgentScope } from "@actspace/core-scope";
import { RequestAssembler } from "../assembler.js";
import { ContributorRegistry } from "../registry.js";
import type { PromptContributor } from "../contributor.js";

function contributor(id: string, order: number, value: string, criticality: PromptContributor["criticality"] = "required"): PromptContributor {
  return { id, ownerPluginId: "plugin", scopeId: "root", kind: "prompt-section", layer: "plugin", order, criticality, resolve: () => ({ value }) };
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
    expect(Object.isFrozen(snapshot)).toBe(true);
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

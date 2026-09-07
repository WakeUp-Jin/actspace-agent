import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAIN_AGENT_DESCRIPTOR } from "@actspace/core-agent";
import { AgentScope } from "@actspace/core-scope";
import { RequestAssembler } from "../assembler.js";
import { createCoreContributors } from "../core-contributors.js";
import { prepareRuntimePromptSource } from "../host-context.js";
import { ContributorRegistry } from "../registry.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("runtime Prompt sources", () => {
  it("assembles identity, Host facts, workspace instructions and a selected Skill into one auditable prompt", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-prompt-source-")); roots.push(root);
    const dataRoot = join(root, "data"); const workspaceRoot = join(root, "workspace"); const homeDir = join(root, "home");
    await mkdir(join(workspaceRoot, ".actspace/skills/review"), { recursive: true });
    await mkdir(dataRoot, { recursive: true });
    await writeFile(join(dataRoot, "AGENTS.md"), "USER_RULE", "utf8");
    await writeFile(join(workspaceRoot, "AGENTS.md"), "WORKSPACE_RULE", "utf8");
    await writeFile(join(workspaceRoot, ".actspace/skills/review/SKILL.md"), "---\nname: review\ndescription: Review repository changes.\n---\nSELECTED_SKILL_BODY\n", "utf8");
    const source = await prepareRuntimePromptSource({ dataRoot, workspaceRoot, homeDir });
    const scope = new AgentScope(MAIN_AGENT_DESCRIPTOR.id, undefined, "main:test"); const registry = new ContributorRegistry();
    for (const contributor of createCoreContributors({ scopeId: scope.identity.scopeId, agent: MAIN_AGENT_DESCRIPTOR, host: { hostKind: "desktop", capabilityCeiling: ["filesystem.read", "approval"], runtimeContract: "actspace.runtime.v2", invocationId: "test", workspaceRef: workspaceRoot }, workspaceRoot, instructions: source.instructions, skills: source.skills })) registry.register(scope, contributor);
    const assembler = new RequestAssembler({ registry, prepare: async () => ({ route: "default", model: "default", registrationId: "registration", adapterVersion: "test", defaults: {}, retryPolicy: {} }) });
    const snapshot = await assembler.assemble({ sessionId: "session", turnId: "turn", stepId: "step", scope, surface: [{ role: "user", content: "hello" }], hostFacts: { agentRunId: "run" }, selectedSkillIds: ["review"] }, [], {}, "composition", "host");
    expect(snapshot.renderedSystemPrompt).toContain("You are ActSpace");
    expect(snapshot.renderedSystemPrompt).toContain("USER_RULE");
    expect(snapshot.renderedSystemPrompt).toContain("WORKSPACE_RULE");
    expect(snapshot.renderedSystemPrompt).toContain("SELECTED_SKILL_BODY");
    expect(snapshot.facts).toContainEqual(expect.objectContaining({ capabilities: ["approval", "filesystem.read"] }));
    expect(JSON.stringify(snapshot.facts)).toContain("SKILL.md");
    expect(JSON.stringify(snapshot.contributorProvenance)).toContain("contentDigest");
    await scope.dispose();
    expect(registry.visible(scope)).toEqual([]);
  });
});

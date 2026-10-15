import { describe, expect, it } from "vitest";
import { MAIN_AGENT_DESCRIPTOR } from "@actspace/core-agent";
import { createCoreContributors } from "../core-contributors.js";
import { SkillCatalog } from "../skills/catalog.js";

const base = { scopeId: "scope", agent: MAIN_AGENT_DESCRIPTOR, host: { hostKind: "desktop" as const, capabilityCeiling: [], runtimeContract: "actspace.runtime.v2", invocationId: "test" }, workspaceRoot: "/workspace", instructions: [], skills: new SkillCatalog() };

describe("output-choice guidance", () => {
  it("is present only when the Agent can call present", async () => {
    const ids = (options: Partial<Parameters<typeof createCoreContributors>[0]>) => createCoreContributors({ ...base, ...options } as Parameters<typeof createCoreContributors>[0]).map(item => item.id);
    expect(ids({ deliverables: true })).toContain("core/output-choice");
    expect(ids({ deliverables: false })).not.toContain("core/output-choice");
    expect(ids({ deliverables: true, profile: "chat" })).not.toContain("core/output-choice");
    const section = createCoreContributors({ ...base, deliverables: true } as Parameters<typeof createCoreContributors>[0]).find(item => item.id === "core/output-choice");
    const value = (await section!.resolve({} as never)).value;
    expect(value).toContain("Do not call present just to list edited source files");
  });
});

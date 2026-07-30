import { describe, expect, it } from "vitest";
import type { SkillCatalogItem } from "@actspace/shared";
import {
  composerSlashFunctionOptionId,
  composerSlashSkillOptionId,
  filterComposerSlashFunctions,
  filterComposerSlashSkills,
  parseComposerSlashQuery,
} from "../components/composer-slash-commands";

function skill(input: Pick<SkillCatalogItem, "name" | "description" | "scope">): SkillCatalogItem {
  return {
    ...input,
    source: input.scope === "project" ? ".agents" : "actspace-userData",
    location: `/skills/${input.name}/SKILL.md`,
    directory: `/skills/${input.name}`,
    status: "available",
    removable: false,
    enabledForAgent: true,
    enabledForKairos: false,
    shadowed: false,
  };
}

describe("composer slash commands", () => {
  it("parses only a leading single-token slash query", () => {
    expect(parseComposerSlashQuery("/")).toBe("");
    expect(parseComposerSlashQuery("/Plan")).toBe("plan");
    expect(parseComposerSlashQuery("/前端")).toBe("前端");
    expect(parseComposerSlashQuery("hello /plan")).toBeNull();
    expect(parseComposerSlashQuery("/eval reason")).toBeNull();
    expect(parseComposerSlashQuery("/eval\nreason")).toBeNull();
    expect(parseComposerSlashQuery("/Users/test")).toBeNull();
    expect(parseComposerSlashQuery("https://example.com")).toBeNull();
  });

  it("filters functions by command, label, and description with command prefixes first", () => {
    expect(filterComposerSlashFunctions("").map((item) => item.id)).toEqual([
      "chat",
      "plan",
      "agent",
      "compact",
      "eval",
      "status",
      "review",
    ]);
    expect(filterComposerSlashFunctions("pla").map((item) => item.id)).toEqual(["plan", "agent"]);
    expect(filterComposerSlashFunctions("CONTEXT").map((item) => item.id)).toEqual(["compact", "status"]);
    expect(filterComposerSlashFunctions("missing")).toEqual([]);
  });

  it("filters and orders skills by scope and name", () => {
    const skills = [
      skill({ name: "Browser", description: "Control a browser", scope: "user" }),
      skill({ name: "frontend-design", description: "Build polished interfaces", scope: "project" }),
      skill({ name: "Agently Mail", description: "Send and search email", scope: "project" }),
    ];

    expect(filterComposerSlashSkills(skills, "").map((item) => item.name)).toEqual([
      "Agently Mail",
      "frontend-design",
      "Browser",
    ]);
    expect(filterComposerSlashSkills(skills, "POLISHED").map((item) => item.name)).toEqual(["frontend-design"]);
    expect(filterComposerSlashSkills(skills, "mail").map((item) => item.name)).toEqual(["Agently Mail"]);
  });

  it("creates stable option ids", () => {
    expect(composerSlashFunctionOptionId("compact")).toBe("composer-slash-function-compact");
    expect(composerSlashSkillOptionId("Agently Mail")).toBe("composer-slash-skill-Agently%20Mail");
  });
});

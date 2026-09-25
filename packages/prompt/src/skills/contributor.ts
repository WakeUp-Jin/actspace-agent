import { readFile } from "node:fs/promises";
import type { PromptContributor } from "../contributor.js";
import type { SkillCatalog } from "./catalog.js";

export function createSkillCatalogContributor(catalog: SkillCatalog, scopeId: string): PromptContributor {
  return Object.freeze({
    id: "core/skills-catalog",
    ownerPluginId: "@actspace/core",
    scopeId,
    kind: "model-fact",
    layer: "core",
    order: 50,
    criticality: "required",
    resolve: () => ({
      value: catalog.toPromptCatalog() as unknown as Record<string, never>,
      provenance: { skillDigests: catalog.list().map((skill) => ({ id: skill.id, digest: skill.contentDigest })) },
    }),
  });
}

export function createSelectedSkillContributor(catalog: SkillCatalog, scopeId: string, selectedIds?: readonly string[]): PromptContributor {
  return Object.freeze({
    id: "core/selected-skills",
    ownerPluginId: "@actspace/core",
    scopeId,
    kind: "prompt-section",
    layer: "agent",
    order: 0,
    criticality: "required",
    resolve: async (input) => {
      const sections = [];
      for (const id of selectedIds ?? input.selectedSkillIds) {
        const skill = catalog.get(id);
        if (skill === undefined) throw new Error(`Selected Skill is unavailable: ${id}.`);
        const content = await readFile(skill.path, "utf8");
        sections.push({ id: skill.id, source: skill.source, digest: skill.contentDigest, content: content.slice(0, 64 * 1024) });
      }
      return { value: sections };
    },
  });
}

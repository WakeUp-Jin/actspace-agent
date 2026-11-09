import { expect, it } from "vitest";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { SCRIPTING_SKILL_IDS, officialSkillsRoot, pluginDevelopmentRoot } from "../index.js";
it("ships the developer guide, contract and executable source template", async () => {
  expect(await readFile(join(pluginDevelopmentRoot, "SKILL.md"), "utf8")).toContain("plugin_manager");
  expect(await readFile(join(pluginDevelopmentRoot, "references/contract.md"), "utf8")).toContain("implementation.ts");
  expect(await readFile(join(pluginDevelopmentRoot, "templates/implementation.ts"), "utf8")).toContain("export async function execute");
});
it("ships scripting skills that target the bundled interpreter and never pip install", async () => {
  for (const id of SCRIPTING_SKILL_IDS) {
    const skill = await readFile(join(officialSkillsRoot, id, "SKILL.md"), "utf8");
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1] ?? "";
    expect(frontmatter, id).toContain(`name: ${id}`);
    expect(frontmatter, id).toMatch(/^description: ".+"$/m);
    expect(skill, id).toContain("actspace-python");
    expect(skill, id).toContain("$ACTSPACE_SCRATCH");
    expect(skill, id).not.toMatch(/^\s*pip install/m);
  }
});
it("keeps the upstream Apache license next to every adapted skill", async () => {
  for (const id of ["office-docx", "office-xlsx", "office-pptx", "pdf"]) {
    const license = await readFile(join(officialSkillsRoot, id, "LICENSE.txt"), "utf8");
    expect(license, id).toContain("Apache License");
    expect(await readFile(join(officialSkillsRoot, id, "SKILL.md"), "utf8"), id).toContain("license: Complete terms in LICENSE.txt");
  }
  await access(join(officialSkillsRoot, "pdf/scripts/pdf_to_images.py"));
});

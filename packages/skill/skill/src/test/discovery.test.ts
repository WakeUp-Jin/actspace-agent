import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverSkills } from "../discovery.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("Skill discovery", () => {
  it("keeps root priority, sorted discovery and catalog-only disclosure", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-skill-"));
    roots.push(root);
    await mkdir(join(root, ".actspace/skills/common"), { recursive: true });
    await mkdir(join(root, ".agents/skills/common"), { recursive: true });
    await writeFile(join(root, ".actspace/skills/common/SKILL.md"), "---\nid: common\nname: Local\ndescription: local\n---\nlocal body\n");
    await writeFile(join(root, ".agents/skills/common/SKILL.md"), "---\nid: common\nname: Other\ndescription: other\n---\nother body\n");
    const catalog = await discoverSkills({ workspaceRoot: root, officialRoot: false });
    expect(catalog.list()).toHaveLength(1);
    expect(catalog.list()[0]?.source).toBe(".actspace/skills");
    expect(catalog.toPromptCatalog()[0]?.location).toBe(join(root, ".actspace/skills/common/SKILL.md"));
  });
});

it("discovers packaged official resources outside a checkout, with id shadowing and disabling", async () => {
  const root = await mkdtemp(join(tmpdir(), "official-discovery-")); roots.push(root);
  const options = { workspaceRoot: root };
  const official = (await discoverSkills(options)).list();
  const officialIds = ["actspace-plugin-development", "data-analysis", "office-docx", "office-pptx", "office-xlsx", "pdf"];
  expect(official.map(skill => skill.id)).toEqual(officialIds);
  expect(official.every(skill => skill.source === "actspace-official@2")).toBe(true);
  expect((await discoverSkills({ ...options, disabled: officialIds })).list()).toEqual([]);
  const local = join(root, ".actspace/skills/override"); await mkdir(local, { recursive: true });
  await writeFile(join(local, "SKILL.md"), "---\r\nid: actspace-plugin-development\r\nname: Local Development\r\ndescription: override\r\n---\r\nbody");
  const shadowed = (await discoverSkills(options)).list();
  expect(shadowed).toHaveLength(officialIds.length);
  expect(shadowed.find(skill => skill.id === "actspace-plugin-development")).toEqual(expect.objectContaining({ name: "Local Development", source: ".actspace/skills" }));
  expect((await discoverSkills({ ...options, disabled: ["Local Development"] })).list().map(skill => skill.id)).not.toContain("actspace-plugin-development");
});

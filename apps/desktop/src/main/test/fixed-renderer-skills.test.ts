import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { listFixedRendererSkills, uninstallFixedRendererSkill } from "../runtime-v2/fixed-renderer-skills";

const OFFICIAL_IDS = ["actspace-plugin-development", "data-analysis", "office-docx", "office-pptx", "office-xlsx", "pdf"];

it("lists packaged official Skills by stable id, honors disabling and shows local shadowing", async () => {
  const root = await mkdtemp(join(tmpdir(), "renderer-skills-"));
  const options = { workspaceRoot: join(root, "project"), dataRoot: join(root, "data"), homeDir: join(root, "home"), disabled: ["actspace-plugin-development"] };
  try {
    const initial = await listFixedRendererSkills(options);
    expect(initial.items.map((item) => item.id).sort()).toEqual(OFFICIAL_IDS);
    expect(initial.items.every((item) => item.scope === "official" && !item.removable && !item.shadowed)).toBe(true);
    const development = initial.items.find((item) => item.id === "actspace-plugin-development");
    expect(development).toMatchObject({ enabledForAgent: false });
    expect(initial.items.filter((item) => item.id !== "actspace-plugin-development").every((item) => item.enabledForAgent)).toBe(true);
    expect(await uninstallFixedRendererSkill(options.dataRoot, development?.directory ?? "")).toMatchObject({ ok: false });
    const local = join(options.workspaceRoot, ".actspace/skills/development"); await mkdir(local, { recursive: true });
    await writeFile(join(local, "SKILL.md"), "---\nid: actspace-plugin-development\nname: My development skill\ndescription: custom\n---\nbody");
    const list = await listFixedRendererSkills({ ...options, disabled: [] });
    const byName = (await listFixedRendererSkills({ ...options, disabled: ["My development skill"] })).items.find((item) => item.name === "My development skill");
    expect(byName?.enabledForAgent).toBe(false);
    expect(list.items).toHaveLength(OFFICIAL_IDS.length + 1);
    expect(list.items[0]).toMatchObject({ name: "My development skill", shadowed: false });
    expect(list.items.find((item) => item.scope === "official" && item.id === "actspace-plugin-development")).toMatchObject({ shadowed: true });
    expect(list.items.filter((item) => item.scope === "official" && item.id !== "actspace-plugin-development").every((item) => !item.shadowed)).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

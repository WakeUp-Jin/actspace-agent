import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { installFixedRendererSkill, listFixedRendererSkills, uninstallFixedRendererSkill } from "../runtime-v2/fixed-renderer-skills";

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

it("installs into the user Skill directory, marks only those Skills removable and refuses to remove anything else", async () => {
  const root = await mkdtemp(join(tmpdir(), "renderer-skills-"));
  const options = { workspaceRoot: join(root, "project"), dataRoot: join(root, "data"), homeDir: join(root, "home"), disabled: [] };
  const skillFile = (id: string) => `---\nid: ${id}\nname: ${id}\ndescription: custom\n---\nbody`;
  try {
    // 目录名以两个点开头，也只是用户 Skill 目录里的一个普通子目录。
    const source = join(root, "..dotted-skill"); await mkdir(source); await writeFile(join(source, "SKILL.md"), skillFile("dotted-skill"));
    expect(await installFixedRendererSkill(options.dataRoot, source)).toEqual({ ok: true, name: "dotted-skill" });
    // 直接放在用户 Skill 目录根上的 SKILL.md 列得出来，但不能卸载：那样会删掉整个目录。
    await writeFile(join(options.dataRoot, "skills", "SKILL.md"), skillFile("root-skill"));
    const project = join(options.workspaceRoot, ".actspace/skills/local"); await mkdir(project, { recursive: true }); await writeFile(join(project, "SKILL.md"), skillFile("project-skill"));
    const items = (await listFixedRendererSkills(options)).items;
    const find = (id: string) => items.find((item) => item.id === id);
    expect(find("dotted-skill")).toMatchObject({ removable: true, directory: join(options.dataRoot, "skills", "..dotted-skill") });
    expect(find("root-skill")).toMatchObject({ removable: false });
    expect(find("project-skill")).toMatchObject({ removable: false });
    expect(await uninstallFixedRendererSkill(options.dataRoot, join(options.dataRoot, "skills"))).toMatchObject({ ok: false });
    expect(await uninstallFixedRendererSkill(options.dataRoot, project)).toMatchObject({ ok: false });
    expect(await uninstallFixedRendererSkill(options.dataRoot, join(options.dataRoot, "skills", "..", "home"))).toMatchObject({ ok: false });
    expect(await uninstallFixedRendererSkill(options.dataRoot, find("dotted-skill")?.directory ?? "")).toEqual({ ok: true });
    const after = (await listFixedRendererSkills(options)).items.map((item) => item.id);
    expect(after).not.toContain("dotted-skill");
    expect(after).toEqual(expect.arrayContaining(["root-skill", "project-skill"]));
  } finally { await rm(root, { recursive: true, force: true }); }
});

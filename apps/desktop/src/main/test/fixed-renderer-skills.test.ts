import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { listFixedRendererSkills, uninstallFixedRendererSkill } from "../runtime-v2/fixed-renderer-skills";
it("lists packaged official Skills by stable id, honors disabling and shows local shadowing", async () => {
  const root = await mkdtemp(join(tmpdir(), "renderer-skills-"));
  const options = { workspaceRoot: join(root, "project"), dataRoot: join(root, "data"), homeDir: join(root, "home"), disabled: ["actspace-plugin-development"] };
  try {
    const initial = await listFixedRendererSkills(options);
    expect(initial.items).toEqual([expect.objectContaining({ id: "actspace-plugin-development", scope: "official", removable: false, enabledForAgent: false, shadowed: false })]);
    expect(await uninstallFixedRendererSkill(options.dataRoot, initial.items[0].directory)).toMatchObject({ ok: false });
    const local = join(options.workspaceRoot, ".actspace/skills/development"); await mkdir(local, { recursive: true });
    await writeFile(join(local, "SKILL.md"), "---\nid: actspace-plugin-development\nname: My development skill\ndescription: custom\n---\nbody");
    const list = await listFixedRendererSkills({ ...options, disabled: [] });
    expect((await listFixedRendererSkills({ ...options, disabled: ["My development skill"] })).items[0].enabledForAgent).toBe(false);
    expect(list.items).toEqual([expect.objectContaining({ name: "My development skill", shadowed: false }), expect.objectContaining({ scope: "official", shadowed: true })]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

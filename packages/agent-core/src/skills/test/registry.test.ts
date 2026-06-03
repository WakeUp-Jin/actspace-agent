import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSkillCatalogSegment,
  createSkillScanRoots,
  loadSkillRegistry,
  parseSkillFile,
} from "../index";

async function createSkill(root: string, name: string, skillMd: string): Promise<void> {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), skillMd, "utf8");
}

function skillMd(name: string, description: string, body = "# Body"): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "---",
    "",
    body,
  ].join("\n");
}

describe("Skill registry", () => {
  it("creates scan roots in project, userData, global, and Claude-compatible order", () => {
    const roots = createSkillScanRoots({
      workspaceRoot: "/workspace",
      dataRoot: "/userData",
      homeDir: "/home/me",
    });

    expect(roots.map((root) => root.path)).toEqual([
      "/workspace/.actspace/skills",
      "/workspace/.agents/skills",
      "/workspace/.claude/skills",
      "/userData/skills",
      "/userData/.actspace/skills",
      "/home/me/.agents/skills",
      "/home/me/.claude/skills",
    ]);
  });

  it("discovers first-level SKILL.md files and dedupes by scan order", async () => {
    const temp = await mkdtemp(join(tmpdir(), "actspace-skills-test-"));
    const workspace = join(temp, "workspace");
    const dataRoot = join(temp, "userData");
    const home = join(temp, "home");

    await createSkill(
      join(workspace, ".agents", "skills"),
      "shared-skill",
      skillMd("shared-skill", "Project agents skill.", "# Project agents body"),
    );
    await createSkill(
      join(home, ".agents", "skills"),
      "shared-skill",
      skillMd("shared-skill", "Global agents skill.", "# Global agents body"),
    );
    await createSkill(
      join(workspace, ".claude", "skills"),
      "claude-only",
      skillMd("claude-only", "Claude project skill."),
    );
    await createSkill(
      join(dataRoot, "skills"),
      "user-only",
      skillMd("user-only", "UserData skill."),
    );
    await createSkill(
      join(workspace, ".agents", "skills", "nested"),
      "ignored-deep",
      skillMd("ignored-deep", "Nested skill should not be scanned."),
    );

    const registry = await loadSkillRegistry({ workspaceRoot: workspace, dataRoot, homeDir: home });

    expect(registry.skills.map((skill) => skill.name)).toEqual([
      "shared-skill",
      "claude-only",
      "user-only",
    ]);
    expect(registry.skills.find((skill) => skill.name === "shared-skill")).toMatchObject({
      description: "Project agents skill.",
      scope: "project",
      source: "agents",
    });
    expect(registry.shadowed).toHaveLength(1);
    expect(registry.shadowed[0]).toMatchObject({
      name: "shared-skill",
      description: "Global agents skill.",
      scope: "user",
    });
    expect(registry.skills.some((skill) => skill.name === "ignored-deep")).toBe(false);
  });

  it("keeps invalid frontmatter as a warning instead of failing registry loading", async () => {
    const temp = await mkdtemp(join(tmpdir(), "actspace-skills-warning-test-"));
    const workspace = join(temp, "workspace");

    await createSkill(join(workspace, ".actspace", "skills"), "broken", "# Missing frontmatter");

    const registry = await loadSkillRegistry({ workspaceRoot: workspace, homeDir: join(temp, "home") });

    expect(registry.skills).toHaveLength(1);
    expect(registry.skills[0]).toMatchObject({
      name: "broken",
      status: "warning",
      warning: "missing frontmatter",
    });
    expect(registry.warnings[0]).toContain("missing frontmatter");
  });

  it("parses quoted descriptions and returns markdown body only", () => {
    const parsed = parseSkillFile(
      [
        "---",
        "name: frontend-design",
        'description: "Use when building UI: dashboards, apps, and components."',
        "---",
        "",
        "# Instructions",
      ].join("\n"),
      "/workspace/.agents/skills/frontend-design",
    );

    expect(parsed).toEqual({
      name: "frontend-design",
      description: "Use when building UI: dashboards, apps, and components.",
      body: "# Instructions",
      warning: undefined,
    });
  });

  it("renders a catalog segment with read_file instructions and absolute skill locations", async () => {
    const temp = await mkdtemp(join(tmpdir(), "actspace-skills-load-test-"));
    const workspace = join(temp, "workspace");
    const skillRoot = join(workspace, ".agents", "skills");
    await createSkill(skillRoot, "llm-agent-dev", skillMd("llm-agent-dev", "Use when building agents.", "# Agent Guide"));

    const registry = await loadSkillRegistry({ workspaceRoot: workspace, homeDir: join(temp, "home") });
    const segment = createSkillCatalogSegment(registry);
    const skillLocation = join(skillRoot, "llm-agent-dev", "SKILL.md");

    expect(segment?.bucket).toBe("skills");
    expect(segment?.content).toContain("<available_skills>");
    expect(segment?.content).toContain("<name>llm-agent-dev</name>");
    expect(segment?.content).toContain(`<location>${skillLocation}</location>`);
    expect(segment?.content).toContain("use read_file on the skill location");
  });
});

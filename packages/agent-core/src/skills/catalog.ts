import { CACHE_STABILITY } from "../context/types";
import type { ContextUsageBucketName } from "@actspace/shared";
import type { SkillRegistry, SkillSummary } from "./types";

export const SKILL_CATALOG_SEGMENT_ID = "skill_catalog";

export interface SkillCatalogSegment {
  id: string;
  title: string;
  content: string;
  bucket: ContextUsageBucketName;
  priority: number;
  stability: number;
}

export function createSkillCatalogSegment(
  registry: SkillRegistry,
): SkillCatalogSegment | undefined {
  if (registry.skills.length === 0) return undefined;

  return {
    id: SKILL_CATALOG_SEGMENT_ID,
    title: "Available Skills",
    content: renderSkillCatalog(registry.skills),
    bucket: "skills",
    priority: 70,
    stability: CACHE_STABILITY.STABLE,
  };
}

export function renderSkillCatalog(skills: SkillSummary[]): string {
  const lines = ["<available_skills>"];
  for (const skill of skills) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <description>${escapeXml(skill.description)}</description>`);
    lines.push(`    <scope>${skill.scope}</scope>`);
    lines.push(`    <source>${skill.source}</source>`);
    lines.push(`    <status>${skill.status}</status>`);
    if (skill.warning) {
      lines.push(`    <warning>${escapeXml(skill.warning)}</warning>`);
    }
    lines.push(`    <location>${escapeXml(skill.location)}</location>`);
    lines.push("  </skill>");
  }
  lines.push("</available_skills>");
  lines.push("");
  lines.push("When the current task matches a skill description, use read_file on the skill location to read SKILL.md.");
  return lines.join("\n");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

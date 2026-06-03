import { basename } from "node:path";
import type { ParsedSkillFile } from "./types";

const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function parseSkillFile(content: string, skillDirectory: string): ParsedSkillFile {
  const fallbackName = basename(skillDirectory);
  const warnings: string[] = [];
  const frontmatter = splitFrontmatter(content);

  if (!frontmatter) {
    warnings.push("missing frontmatter");
    return {
      name: fallbackName,
      description: "",
      body: content,
      warning: warnings.join("; "),
    };
  }

  const fields = parseFrontmatterFields(frontmatter.header);
  let name = fields.get("name") ?? "";
  let description = fields.get("description") ?? "";

  if (!name) {
    name = fallbackName;
    warnings.push("missing required frontmatter field: name");
  }
  if (name.length > MAX_NAME_LENGTH) {
    name = name.slice(0, MAX_NAME_LENGTH);
    warnings.push(`name exceeded ${MAX_NAME_LENGTH} chars and was truncated`);
  }
  if (!SKILL_NAME_RE.test(name)) {
    warnings.push("name should use lowercase letters, numbers, and hyphens");
  }

  if (!description) {
    warnings.push("missing required frontmatter field: description");
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    description = description.slice(0, MAX_DESCRIPTION_LENGTH);
    warnings.push(`description exceeded ${MAX_DESCRIPTION_LENGTH} chars and was truncated`);
  }

  return {
    name,
    description,
    body: frontmatter.body,
    warning: warnings.length > 0 ? warnings.join("; ") : undefined,
  };
}

function splitFrontmatter(content: string): { header: string; body: string } | null {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return null;

  const endIndex = normalized.indexOf("\n---", 4);
  if (endIndex < 0) return null;

  const afterFence = normalized.slice(endIndex + "\n---".length);
  const body = afterFence.replace(/^\n+/, "");
  return {
    header: normalized.slice(4, endIndex),
    body,
  };
}

function parseFrontmatterFields(header: string): Map<string, string> {
  const fields = new Map<string, string>();
  const lines = header.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex <= 0) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    const rawValue = trimmed.slice(colonIndex + 1).trim();
    if (!key || !rawValue) continue;

    fields.set(key, parseScalar(rawValue));
  }

  return fields;
}

function parseScalar(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    const inner = value.slice(1, -1);
    if (value.startsWith('"')) {
      try {
        return JSON.parse(value) as string;
      } catch {
        return inner;
      }
    }
    return inner.replace(/''/g, "'");
  }
  return value;
}

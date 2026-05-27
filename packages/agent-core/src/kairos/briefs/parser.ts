import { readFile, stat } from "node:fs/promises";

export type BriefStatus = "active" | "paused" | "done" | "failed";
export type BriefTrigger = "interval" | "manual" | "event";
export type BriefPriority = "high" | "normal" | "low";

export interface BriefFrontmatter {
  id: string;
  status: BriefStatus;
  trigger: BriefTrigger;
  /** v1：用秒数间隔代替 cron 表达式（详见 history）；v2 可加 `cron` 字段。 */
  intervalSec: number | null;
  priority: BriefPriority;
  created: string;
  lastRun: string | null;
  nextRun: string | null;
}

export interface BriefDoc {
  frontmatter: BriefFrontmatter;
  body: string;                                      // 正文 markdown（不含 frontmatter）
  filePath: string;
  fileMtime: number;
}

/**
 * 极简手写 frontmatter 解析（避免引入 gray-matter）。
 *
 * 支持：
 *   ---
 *   key: string-value
 *   key2: 123
 *   key3: true
 *   key4: null
 *   ---
 *   <body>
 *
 * 不支持：嵌套对象、数组、多行字符串。对 v1 的 brief 模板足够。
 */
export async function parseBriefFile(filePath: string): Promise<BriefDoc> {
  const [raw, meta] = await Promise.all([readFile(filePath, "utf8"), stat(filePath)]);
  const parsed = parseFrontmatterAndBody(raw);
  const frontmatter = coerceFrontmatter(parsed.frontmatter, filePath);
  return {
    frontmatter,
    body: parsed.body,
    filePath,
    fileMtime: meta.mtimeMs,
  };
}

export function fullBriefMarkdown(doc: BriefDoc): string {
  const lines = ["---"];
  for (const [k, v] of Object.entries(doc.frontmatter)) {
    lines.push(`${k}: ${serializeYamlValue(v)}`);
  }
  lines.push("---", "", doc.body);
  return lines.join("\n");
}

// ─── Internal ──────────────────────────────────────────────────────────────

interface ParseRawResult {
  frontmatter: Record<string, unknown>;
  body: string;
}

function parseFrontmatterAndBody(text: string): ParseRawResult {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") {
    return { frontmatter: {}, body: text };
  }
  const fmLines: string[] = [];
  let bodyStart = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      bodyStart = i + 1;
      break;
    }
    fmLines.push(lines[i]);
  }
  if (bodyStart === -1) return { frontmatter: {}, body: text };

  const frontmatter: Record<string, unknown> = {};
  for (const line of fmLines) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    const valueText = m[2].trim();
    frontmatter[key] = decodeYamlScalar(valueText);
  }

  // 去 body 起始的空行
  let body = lines.slice(bodyStart).join("\n");
  body = body.replace(/^\n+/, "");
  return { frontmatter, body };
}

function decodeYamlScalar(text: string): unknown {
  if (text === "" || text === "null" || text === "~") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+$/.test(text)) return Number(text);
  if (/^-?\d+\.\d+$/.test(text)) return Number(text);
  if ((text.startsWith(`"`) && text.endsWith(`"`)) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

function serializeYamlValue(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  return String(v);
}

const STATUS_ALLOWED: readonly BriefStatus[] = ["active", "paused", "done", "failed"];
const TRIGGER_ALLOWED: readonly BriefTrigger[] = ["interval", "manual", "event"];
const PRIORITY_ALLOWED: readonly BriefPriority[] = ["high", "normal", "low"];

function coerceFrontmatter(raw: Record<string, unknown>, filePath: string): BriefFrontmatter {
  const fileId = idFromPath(filePath);
  const id = typeof raw.id === "string" ? raw.id : fileId;
  if (id !== fileId) {
    throw new Error(`Brief frontmatter id "${id}" does not match filename "${fileId}"`);
  }
  const status = pickEnum(raw.status, STATUS_ALLOWED, "active");
  const trigger = pickEnum(raw.trigger, TRIGGER_ALLOWED, "interval");
  const priority = pickEnum(raw.priority, PRIORITY_ALLOWED, "normal");
  const intervalSec = typeof raw.intervalSec === "number" && raw.intervalSec > 0
    ? Math.floor(raw.intervalSec)
    : null;
  const created = typeof raw.created === "string" ? raw.created : new Date().toISOString();
  const lastRun = typeof raw.lastRun === "string" ? raw.lastRun : null;
  const nextRun = typeof raw.nextRun === "string" ? raw.nextRun : null;
  return { id, status, trigger, intervalSec, priority, created, lastRun, nextRun };
}

function idFromPath(filePath: string): string {
  const base = filePath.replace(/^.*\//, "").replace(/^.*\\/, "");
  return base.replace(/\.md$/, "");
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

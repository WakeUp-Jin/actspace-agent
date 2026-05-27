import { readFile } from "node:fs/promises";
import type { BriefIndexEntry, BriefsIndexManager } from "./index-manager";

export type TickPayload =
  | { trigger: "auto"; content: string }
  | { trigger: "brief"; briefId: string; content: string };

const PRIORITY_RANK: Record<string, number> = { high: 0, normal: 1, low: 2 };

/**
 * 决定本次 tick 投递的内容：到期的 brief（按 priority + nextRun）或默认 auto tick。
 *
 * 状态推进（markRun）不在这里——由 controller 在 turn 闭合后调 index.markRun。
 */
export class BriefsDispatcher {
  constructor(private readonly index: BriefsIndexManager) {}

  async pickNext(now: Date = new Date()): Promise<TickPayload> {
    const entries = await this.index.list();
    const due = entries.filter(isDue(now));
    if (due.length === 0) return autoTick(now);

    due.sort(compareBriefs);
    const top = due[0];
    const body = await readBody(top);
    return { trigger: "brief", briefId: top.id, content: body };
  }
}

function isDue(now: Date): (entry: BriefIndexEntry) => boolean {
  return (entry) => {
    const fm = entry.frontmatter;
    if (fm.status !== "active") return false;
    if (!fm.nextRun) {
      // 没排过下次时间：trigger=interval 且第一次 → 视为立即可投
      return fm.trigger === "interval" && fm.intervalSec !== null && !fm.lastRun;
    }
    return Date.parse(fm.nextRun) <= now.getTime();
  };
}

function compareBriefs(a: BriefIndexEntry, b: BriefIndexEntry): number {
  const ap = PRIORITY_RANK[a.frontmatter.priority] ?? 3;
  const bp = PRIORITY_RANK[b.frontmatter.priority] ?? 3;
  if (ap !== bp) return ap - bp;
  const an = a.frontmatter.nextRun ? Date.parse(a.frontmatter.nextRun) : 0;
  const bn = b.frontmatter.nextRun ? Date.parse(b.frontmatter.nextRun) : 0;
  return an - bn;
}

async function readBody(entry: BriefIndexEntry): Promise<string> {
  try {
    const raw = await readFile(entry.filePath, "utf8");
    return stripFrontmatter(raw);
  } catch {
    return `# ${entry.id}\n[brief file unreadable]`;
  }
}

function stripFrontmatter(raw: string): string {
  const lines = raw.split("\n");
  if (lines[0]?.trim() !== "---") return raw;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      return lines.slice(i + 1).join("\n").replace(/^\n+/, "");
    }
  }
  return raw;
}

function autoTick(now: Date): { trigger: "auto"; content: string } {
  const ts = now.toISOString().replace("T", " ").slice(0, 19);
  return { trigger: "auto", content: `<tick>${ts}</tick>` };
}

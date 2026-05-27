import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseBriefFile, type BriefDoc, type BriefFrontmatter, type BriefStatus } from "./parser";

export interface BriefIndexEntry {
  id: string;
  filePath: string;
  fileMtime: number;
  frontmatter: BriefFrontmatter;
}

export interface BriefsIndex {
  entries: BriefIndexEntry[];
  generatedAt: string;
}

/**
 * 维护 `<briefsDir>/index.json`：
 * - rebuildFromDisk()：列出 tasks/*.md，全量重读 frontmatter → 写 index.json。
 * - markRun()：tick 完成后由 controller 调用，更新对应 brief 的 lastRun/nextRun 并落 index.json。
 *
 * v1 不监听文件变更（不引入 chokidar）；plan 6 main IPC 在用户保存 brief 后主动调用 rebuildFromDisk()。
 */
export class BriefsIndexManager {
  private readonly briefsDir: string;
  private readonly tasksDir: string;
  private readonly indexFile: string;
  private cache: BriefsIndex | null = null;

  constructor(briefsDir: string) {
    this.briefsDir = briefsDir;
    this.tasksDir = join(briefsDir, "tasks");
    this.indexFile = join(briefsDir, "index.json");
  }

  async list(): Promise<BriefIndexEntry[]> {
    const idx = this.cache ?? (await this.readIndexFromDisk());
    this.cache = idx;
    return idx.entries;
  }

  async rebuildFromDisk(): Promise<BriefsIndex> {
    await mkdir(this.tasksDir, { recursive: true });
    const files = await safeReaddir(this.tasksDir);
    const entries: BriefIndexEntry[] = [];
    for (const name of files) {
      if (!name.endsWith(".md")) continue;
      const filePath = join(this.tasksDir, name);
      try {
        const doc = await parseBriefFile(filePath);
        entries.push({
          id: doc.frontmatter.id,
          filePath: doc.filePath,
          fileMtime: doc.fileMtime,
          frontmatter: doc.frontmatter,
        });
      } catch (err) {
        entries.push({
          id: name.replace(/\.md$/, ""),
          filePath,
          fileMtime: 0,
          frontmatter: {
            id: name.replace(/\.md$/, ""),
            status: "failed" satisfies BriefStatus,
            trigger: "manual",
            intervalSec: null,
            priority: "low",
            created: new Date().toISOString(),
            lastRun: null,
            nextRun: null,
          },
        });
        // 记录错误细节通过 controller 的事件总线在 plan 5 阶段补；这里保持最小写入
        void err;
      }
    }
    entries.sort((a, b) => a.id.localeCompare(b.id));
    const idx: BriefsIndex = { entries, generatedAt: new Date().toISOString() };
    await this.writeIndex(idx);
    this.cache = idx;
    return idx;
  }

  async markRun(
    id: string,
    result: "ok" | "failed",
    now: Date = new Date(),
  ): Promise<void> {
    const idx = await this.rebuildIfNeeded();
    const entry = idx.entries.find((e) => e.id === id);
    if (!entry) return;
    const fm = { ...entry.frontmatter };
    fm.lastRun = now.toISOString();
    fm.status = result === "failed" ? ("failed" satisfies BriefStatus) : fm.status;
    if (fm.status === "active" && fm.trigger === "interval" && fm.intervalSec) {
      fm.nextRun = new Date(now.getTime() + fm.intervalSec * 1000).toISOString();
    } else if (fm.status !== "active") {
      fm.nextRun = null;
    }
    entry.frontmatter = fm;
    await this.writeIndex(idx);
    await this.writeFrontmatterBackToFile(entry, fm);
    this.cache = idx;
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private async rebuildIfNeeded(): Promise<BriefsIndex> {
    if (this.cache) return this.cache;
    return this.readIndexFromDisk();
  }

  private async readIndexFromDisk(): Promise<BriefsIndex> {
    try {
      const raw = await readFile(this.indexFile, "utf8");
      const parsed = JSON.parse(raw) as BriefsIndex;
      if (parsed && Array.isArray(parsed.entries)) return parsed;
    } catch {
      // 不存在 / 损坏：fall through 到 rebuild
    }
    return this.rebuildFromDisk();
  }

  private async writeIndex(idx: BriefsIndex): Promise<void> {
    await mkdir(this.briefsDir, { recursive: true });
    const tmp = `${this.indexFile}.tmp`;
    await writeFile(tmp, JSON.stringify(idx, null, 2), "utf8");
    await rename(tmp, this.indexFile);
  }

  private async writeFrontmatterBackToFile(entry: BriefIndexEntry, fm: BriefFrontmatter): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(entry.filePath, "utf8");
    } catch {
      return;
    }
    const replaced = replaceFrontmatter(raw, fm);
    const tmp = `${entry.filePath}.tmp`;
    await writeFile(tmp, replaced, "utf8");
    await rename(tmp, entry.filePath);
  }
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

function replaceFrontmatter(raw: string, fm: BriefFrontmatter): string {
  const lines = raw.split("\n");
  let body: string;
  if (lines[0]?.trim() === "---") {
    let end = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        end = i;
        break;
      }
    }
    body = end >= 0 ? lines.slice(end + 1).join("\n").replace(/^\n+/, "") : raw;
  } else {
    body = raw;
  }
  const out: string[] = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    out.push(`${k}: ${v === null ? "null" : String(v)}`);
  }
  out.push("---", "", body);
  return out.join("\n");
}

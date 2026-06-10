import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SessionEvent } from "@actspace/shared";

/**
 * 文件布局（详见 docs/exec-plans/active/kairos_short_term_memory.md §1）：
 *
 *   <rootDir>/
 *     2026-05/
 *       2026-05-27.jsonl              ← 当日初始段（plain）
 *       2026-05-27_001.jsonl          ← reset_today 之后切出的新段
 *       2026-05-26.jsonl
 *       week_05-20_to_05-26.summary.md
 *     2026-04/
 *       month_2026-04.summary.md
 *     year_2025.summary.md
 *
 * 算法与命名严格对齐 heartclaw `ShortMemoryStore`，但 JSONL 行格式 = `SessionEvent`。
 *
 * 解析行损坏（手写垃圾行）时静默跳过，避免一条坏行让整个 Kairos 启动失败。
 */

const SEGMENT_RE = /^(\d{4}-\d{2}-\d{2})(?:_(\d{3}))?\.jsonl$/;
const MONTH_DIR_RE = /^\d{4}-\d{2}$/;

export interface SummaryFile {
  /** 文件名（不含目录），如 `week_05-20_to_05-26.summary.md` */
  name: string;
  /** 绝对路径 */
  path: string;
  /** 文件名解析得到的标签（不含 `.summary.md` 后缀） */
  label: string;
}

export class ShortMemoryStore {
  private readonly rootDir: string;
  private todayCache: string;
  private activeFile: string;

  constructor(rootDir: string, now: () => Date = () => new Date()) {
    this.rootDir = rootDir;
    this.todayCache = toIsoDate(now());
    this.activeFile = "";       // 第一次 append/rotate 时延迟初始化
  }

  // ─── Write ────────────────────────────────────────────────────────────

  /** 追加一条 SessionEvent；自动按当日切文件（含 reset_today 后的 _NNN 段）。 */
  async appendEvent(event: SessionEvent, now: Date = new Date()): Promise<void> {
    const today = toIsoDate(now);
    if (today !== this.todayCache || this.activeFile === "") {
      this.todayCache = today;
      this.activeFile = await this.findActiveFile(today);
    }
    await appendFile(this.activeFile, `${JSON.stringify(event)}\n`, "utf8");
  }

  /** /reset_today：为今天创建一个新段（递增 _NNN），不删除旧段。 */
  async rotateDaily(now: Date = new Date()): Promise<string> {
    const today = toIsoDate(now);
    this.todayCache = today;
    const nextSeq = await this.nextSegmentSequence(today);
    const monthDir = this.getMonthDir(today);
    await mkdir(monthDir, { recursive: true });
    const segPath = join(monthDir, `${today}_${String(nextSeq).padStart(3, "0")}.jsonl`);
    await writeFile(segPath, "", "utf8");
    this.activeFile = segPath;
    return segPath;
  }

  /** Summary 写盘（atomic-write 简化版：直接 writeFile）。 */
  async saveSummary(monthDir: string, name: string, content: string): Promise<void> {
    await mkdir(monthDir, { recursive: true });
    await writeFile(join(monthDir, name), content, "utf8");
  }

  // ─── Read ─────────────────────────────────────────────────────────────

  /** 加载指定日期的"最新段"（reset_today 后的最后一个 _NNN，否则 plain）。 */
  async loadDaily(date: string): Promise<SessionEvent[]> {
    const path = await this.findLatestSegmentPath(date);
    if (!path) return [];
    return readJsonl(path);
  }

  /** 加载指定日期所有段（compression 用，跨越 reset_today 边界）。 */
  async loadDailyAll(date: string): Promise<SessionEvent[]> {
    const paths = await this.listDailySegments(date);
    const results: SessionEvent[] = [];
    for (const p of paths) results.push(...(await readJsonl(p)));
    return results;
  }

  /**
   * 加载**所有日期、所有段**的 SessionEvent（含 reset_today 之后切出的 _NNN 段）。
   *
   * 用途：跨重启/跨 reset 的全量统计（例如 Usage 页面的"全部数据"模式）。
   *
   * 注意：
   * - 不应用于热路径——这一调用会一次性读全部历史 jsonl 到内存，建议放在 IPC handler 中按需触发；
   * - 返回顺序为：日期从旧到新（与 `listAllDates` 反序），同日内按 segmentIndex 升序，跟时间线一致；
   * - 文件损坏行会被静默跳过（沿用 `readJsonl` 的容错策略）。
   */
  async loadAll(): Promise<SessionEvent[]> {
    const datesNewestFirst = await this.listAllDates();
    const datesOldestFirst = datesNewestFirst.slice().reverse();
    const results: SessionEvent[] = [];
    for (const date of datesOldestFirst) {
      results.push(...(await this.loadDailyAll(date)));
    }
    return results;
  }

  async readSummary(path: string): Promise<string> {
    try {
      return await readFile(path, "utf8");
    } catch {
      return "";
    }
  }

  // ─── Path helpers ─────────────────────────────────────────────────────

  getMonthDir(date: string): string {
    return join(this.rootDir, date.slice(0, 7));
  }

  /** 列出某日的所有段：plain 优先 + _001, _002, ...，按 segmentIndex 升序。 */
  async listDailySegments(date: string): Promise<string[]> {
    const monthDir = this.getMonthDir(date);
    const all = await safeReaddir(monthDir);
    const segments: Array<{ seq: number; path: string }> = [];
    for (const name of all) {
      const m = SEGMENT_RE.exec(name);
      if (!m) continue;
      if (m[1] !== date) continue;
      const seq = m[2] ? Number(m[2]) : 0;       // plain 视作 seq=0
      segments.push({ seq, path: join(monthDir, name) });
    }
    segments.sort((a, b) => a.seq - b.seq);
    return segments.map((s) => s.path);
  }

  /** 全部已知日期，按从新到旧排序（去重）。 */
  async listAllDates(): Promise<string[]> {
    const months = await this.listMonthDirs();
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (let i = months.length - 1; i >= 0; i--) {
      const entries = await safeReaddir(months[i]);
      const dates: string[] = [];
      for (const name of entries) {
        const m = SEGMENT_RE.exec(name);
        if (m && !seen.has(m[1])) {
          seen.add(m[1]);
          dates.push(m[1]);
        }
      }
      dates.sort().reverse();              // 同月内由新到旧
      ordered.push(...dates);
    }
    return ordered;
  }

  /** Month 目录下的所有 *.summary.md。 */
  async listSummaries(monthDir: string): Promise<SummaryFile[]> {
    const entries = await safeReaddir(monthDir);
    return entries
      .filter((n) => n.endsWith(".summary.md"))
      .sort()
      .map((name) => ({
        name,
        path: join(monthDir, name),
        label: name.replace(/\.summary\.md$/, ""),
      }));
  }

  /** 仓库根目录下的 year_*.summary.md。 */
  async listYearSummaries(): Promise<SummaryFile[]> {
    const entries = await safeReaddir(this.rootDir);
    return entries
      .filter((n) => /^year_.*\.summary\.md$/.test(n))
      .sort()
      .map((name) => ({
        name,
        path: join(this.rootDir, name),
        label: name.replace(/\.summary\.md$/, ""),
      }));
  }

  // ─── Summary 覆盖判定 ─────────────────────────────────────────────────

  isCoveredBySummary(date: string, summaries: SummaryFile[]): boolean {
    return this.findCoveringSummary(date, summaries) !== null;
  }

  findCoveringSummary(date: string, summaries: SummaryFile[]): SummaryFile | null {
    for (const s of summaries) {
      if (s.label.startsWith("week_")) {
        const range = parseWeekRange(s.label, date);
        if (range && date >= range.start && date <= range.end) return s;
      } else if (s.label.startsWith("month_")) {
        const monthStr = s.label.replace("month_", "");
        if (date.slice(0, 7) === monthStr) return s;
      }
    }
    return null;
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private async listMonthDirs(): Promise<string[]> {
    const entries = await safeReaddir(this.rootDir);
    return entries
      .filter((n) => MONTH_DIR_RE.test(n))
      .sort()
      .map((n) => join(this.rootDir, n));
  }

  private async findActiveFile(date: string): Promise<string> {
    const monthDir = this.getMonthDir(date);
    const segments = await this.listDailySegments(date);
    if (segments.length > 0) {
      return segments[segments.length - 1];
    }
    await mkdir(monthDir, { recursive: true });
    const plain = join(monthDir, `${date}.jsonl`);
    try {
      await writeFile(plain, "", { encoding: "utf8", flag: "wx" });
    } catch {
      // 已存在 race：忽略
    }
    return plain;
  }

  private async findLatestSegmentPath(date: string): Promise<string | null> {
    const segments = await this.listDailySegments(date);
    return segments.length === 0 ? null : segments[segments.length - 1];
  }

  private async nextSegmentSequence(date: string): Promise<number> {
    const monthDir = this.getMonthDir(date);
    const entries = await safeReaddir(monthDir);
    let max = 0;
    for (const name of entries) {
      const m = SEGMENT_RE.exec(name);
      if (m && m[1] === date && m[2]) {
        max = Math.max(max, Number(m[2]));
      }
    }
    return max + 1;
  }
}

// ─── 模块级 helpers ────────────────────────────────────────────────────

/** UTC 日期 → `YYYY-MM-DD`。store 的分段命名与压缩触发的日期判定共用同一规则。 */
export function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function readJsonl(path: string): Promise<SessionEvent[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return [];
  }
  const events: SessionEvent[] = [];
  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      events.push(JSON.parse(line) as SessionEvent);
    } catch {
      // 损坏行：忽略，不让一行垃圾炸掉整文件
    }
  }
  return events;
}

/**
 * 解析 `week_05-20_to_05-26` 形式。
 * heartclaw 用日期所在年份补齐；我们沿用同样规则——周摘要按"参考 date 同年"补齐。
 */
function parseWeekRange(
  label: string,
  referenceDate: string,
): { start: string; end: string } | null {
  const parts = label.replace("week_", "").split("_to_");
  if (parts.length !== 2) return null;
  if (!/^\d{2}-\d{2}$/.test(parts[0]) || !/^\d{2}-\d{2}$/.test(parts[1])) return null;
  const year = referenceDate.slice(0, 4);
  return {
    start: `${year}-${parts[0]}`,
    end: `${year}-${parts[1]}`,
  };
}

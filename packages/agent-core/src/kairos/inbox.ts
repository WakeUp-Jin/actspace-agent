import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type KairosInboxSource = "main-agent" | "lab-agent";
export type KairosInboxPriority = "high" | "normal" | "low";

export const KAIROS_INBOX_DIR = "inbox";
export const KAIROS_INBOX_MAX_MESSAGES_PER_FILE = 8;
export const KAIROS_INBOX_MAX_CHARS_PER_FILE = 1800;
export const KAIROS_INBOX_MAX_COMBINED_CHARS = 3000;

const SOURCE_LABELS: Record<KairosInboxSource, string> = {
  "main-agent": "Main Agent",
  "lab-agent": "Lab Agent",
};

const SOURCE_DESCRIPTIONS: Record<KairosInboxSource, string> = {
  "main-agent":
    "Main Agent can append observations, repeated failures, user preferences, or Lab candidates here for Kairos to inspect during future ticks.",
  "lab-agent":
    "Lab Agent can append experiment observations, blocked follow-ups, evidence requests, or pending decisions here for Kairos to inspect during future ticks.",
};

export interface AppendKairosInboxMessageInput {
  kairosRoot: string;
  source: KairosInboxSource;
  priority?: KairosInboxPriority;
  topic: string;
  body: string;
  relatedSessionId?: string;
  relatedExperimentId?: string;
  workspaceRoot?: string;
  now?: Date;
}

/** 已读水位：来源 → 最后已读消息块的 ISO 时间戳（消息块头 `### <ISO> | …` 即天然游标）。 */
export type KairosInboxReadCursor = Partial<Record<KairosInboxSource, string>>;

export interface LoadKairosInboxSummaryInput {
  kairosRoot: string;
  maxMessagesPerFile?: number;
  maxCharsPerFile?: number;
  maxCombinedChars?: number;
  /**
   * 已读水位。传入时只返回时间戳晚于水位的新消息块（观测增量化）；
   * 不传时返回全部最近消息（冷启动语义：一切都是新的）。
   */
  readCursor?: KairosInboxReadCursor;
}

export interface KairosInboxFileSummary {
  source: KairosInboxSource;
  path: string;
  content: string;
  totalMessageCount: number;
  /** 本次注入的（新）消息块数量；为 0 时观测增量会省略该来源。 */
  includedMessageCount: number;
  truncated: boolean;
  missing: boolean;
  warning?: string;
  /**
   * 文件内可解析的最新消息块时间戳（不限于新消息）。
   * tick 正常闭合后由调用方写回已读水位；失败 tick 不写 → 下个 tick 重见同批增量。
   */
  latestMessageTimestamp?: string;
  /**
   * 内容来自无消息块的 fallback 文本（手工编辑的 inbox）。无时间戳可推进水位，
   * 在该来源出现第一条带时间戳的消息前会持续可见——重复展示好过丢手写信号。
   */
  usedFallback?: boolean;
}

export interface KairosInboxSummary {
  text: string;
  files: KairosInboxFileSummary[];
  truncated: boolean;
  warnings: string[];
}

export function getKairosInboxDir(kairosRoot: string): string {
  return join(kairosRoot, KAIROS_INBOX_DIR);
}

export function getKairosInboxFilePath(kairosRoot: string, source: KairosInboxSource): string {
  return join(getKairosInboxDir(kairosRoot), `${source}.md`);
}

export function defaultKairosInboxContent(source: KairosInboxSource): string {
  const label = SOURCE_LABELS[source];
  return [
    `# ${label} -> Kairos Inbox`,
    "",
    SOURCE_DESCRIPTIONS[source],
    "",
    "## Pending",
    "",
  ].join("\n");
}

export async function ensureKairosInboxScaffolding(kairosRoot: string): Promise<void> {
  await mkdir(getKairosInboxDir(kairosRoot), { recursive: true });
  await Promise.all(
    (Object.keys(SOURCE_LABELS) as KairosInboxSource[]).map(async (source) => {
      const path = getKairosInboxFilePath(kairosRoot, source);
      try {
        await readFile(path, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        await writeFile(path, defaultKairosInboxContent(source), "utf8");
      }
    }),
  );
}

export async function appendKairosInboxMessage(input: AppendKairosInboxMessageInput): Promise<void> {
  const priority = input.priority ?? "normal";
  const source = input.source;
  const topic = sanitizeSingleLine(input.topic, "untitled");
  const body = normalizeBody(input.body);
  const timestamp = (input.now ?? new Date()).toISOString();

  await ensureKairosInboxScaffolding(input.kairosRoot);

  const lines: string[] = [
    "",
    `### ${timestamp} | priority: ${priority} | topic: ${topic}`,
    "",
    `- from: ${source}`,
  ];
  if (input.relatedSessionId) {
    lines.push(`- relatedSessionId: ${sanitizeSingleLine(input.relatedSessionId)}`);
  }
  if (input.relatedExperimentId) {
    lines.push(`- relatedExperimentId: ${sanitizeSingleLine(input.relatedExperimentId)}`);
  }
  if (input.workspaceRoot) {
    lines.push(`- workspaceRoot: ${sanitizeSingleLine(input.workspaceRoot)}`);
  }
  lines.push("", body, "");

  await appendFile(getKairosInboxFilePath(input.kairosRoot, source), `${lines.join("\n")}\n`, "utf8");
}

export async function loadKairosInboxSummary(input: LoadKairosInboxSummaryInput): Promise<KairosInboxSummary> {
  const maxMessagesPerFile = input.maxMessagesPerFile ?? KAIROS_INBOX_MAX_MESSAGES_PER_FILE;
  const maxCharsPerFile = input.maxCharsPerFile ?? KAIROS_INBOX_MAX_CHARS_PER_FILE;
  const maxCombinedChars = input.maxCombinedChars ?? KAIROS_INBOX_MAX_COMBINED_CHARS;

  const files = await Promise.all(
    (Object.keys(SOURCE_LABELS) as KairosInboxSource[]).map((source) =>
      loadInboxFileSummary(
        input.kairosRoot,
        source,
        maxMessagesPerFile,
        maxCharsPerFile,
        input.readCursor?.[source],
      ),
    ),
  );
  const warnings = files.flatMap((file) => (file.warning ? [file.warning] : []));
  const rawText = formatInboxSummary(files);
  const text = truncateKeepingEnd(rawText, maxCombinedChars, "…[earlier Agent inbox summary truncated]");

  return {
    text,
    files,
    truncated: text !== rawText || files.some((file) => file.truncated),
    warnings,
  };
}

async function loadInboxFileSummary(
  kairosRoot: string,
  source: KairosInboxSource,
  maxMessages: number,
  maxChars: number,
  cursorTs?: string,
): Promise<KairosInboxFileSummary> {
  const path = getKairosInboxFilePath(kairosRoot, source);
  try {
    const content = await readFile(path, "utf8");
    const blocks = extractMessageBlocks(content);
    const latestMessageTimestamp = latestBlockTimestamp(blocks);

    // 水位过滤：只保留时间戳晚于水位的新消息块。
    // 无法解析时间戳的块视为"早于水位"（appendKairosInboxMessage 写的头一定可解析；
    // 手工编辑的异常块只在无水位的冷启动时出现一次，不会每 tick 重复刷屏）。
    const cursorMs = cursorTs ? Date.parse(cursorTs) : Number.NaN;
    const newBlocks = Number.isFinite(cursorMs)
      ? blocks.filter((b) => {
          const ts = blockTimestampMs(b);
          return ts !== null && ts > cursorMs;
        })
      : blocks;

    const fallback = newBlocks.length === 0 && blocks.length === 0 ? extractFallbackContent(content) : [];
    const selected = newBlocks.length > 0 ? newBlocks.slice(-maxMessages) : fallback;
    const usedFallback = newBlocks.length === 0 && fallback.length > 0;
    const joined = selected.join("\n\n").trim();
    const truncatedContent = joined.length > 0
      ? truncateKeepingEnd(joined, maxChars, "…[earlier inbox content truncated]")
      : "（自上个 tick 无新消息）";
    const includedMessageCount = newBlocks.length > 0 ? Math.min(newBlocks.length, maxMessages) : 0;
    return {
      source,
      path,
      content: truncatedContent,
      totalMessageCount: blocks.length,
      includedMessageCount,
      truncated: newBlocks.length > maxMessages || (joined.length > 0 && truncatedContent !== joined),
      missing: false,
      ...(latestMessageTimestamp ? { latestMessageTimestamp } : {}),
      ...(usedFallback ? { usedFallback: true } : {}),
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {
        source,
        path,
        content: "（文件不存在；下次 bootstrap 会重建默认 inbox）",
        totalMessageCount: 0,
        includedMessageCount: 0,
        truncated: false,
        missing: true,
        warning: `${source} inbox file is missing`,
      };
    }
    return {
      source,
      path,
      content: "（读取失败；本次 tick 忽略该 inbox）",
      totalMessageCount: 0,
      includedMessageCount: 0,
      truncated: false,
      missing: false,
      warning: `${source} inbox read failed: ${(error as Error).message}`,
    };
  }
}

/** 解析消息块头 `### <ISO> | …` 的时间戳；解析失败返回 null。 */
function blockTimestampMs(block: string): number | null {
  const m = /^###\s+(\S+)\s*\|/.exec(block);
  if (!m) return null;
  const ms = Date.parse(m[1]);
  return Number.isFinite(ms) ? ms : null;
}

/** 全部消息块中可解析的最新时间戳（ISO 原文）；无可解析块时返回 undefined。 */
function latestBlockTimestamp(blocks: string[]): string | undefined {
  let bestMs = Number.NEGATIVE_INFINITY;
  let bestIso: string | undefined;
  for (const block of blocks) {
    const m = /^###\s+(\S+)\s*\|/.exec(block);
    if (!m) continue;
    const ms = Date.parse(m[1]);
    if (Number.isFinite(ms) && ms > bestMs) {
      bestMs = ms;
      bestIso = m[1];
    }
  }
  return bestIso;
}

function extractMessageBlocks(content: string): string[] {
  const matches = [...content.matchAll(/^###\s+.*$/gm)];
  return matches
    .map((match, index) => {
      const start = match.index ?? 0;
      const end = index + 1 < matches.length ? matches[index + 1].index ?? content.length : content.length;
      return content.slice(start, end).trim();
    })
    .filter((block) => block.length > 0);
}

function extractFallbackContent(content: string): string[] {
  const pendingIndex = content.search(/^##\s+Pending\s*$/m);
  const body = pendingIndex >= 0
    ? content.slice(pendingIndex).replace(/^##\s+Pending\s*$/m, "")
    : content;
  const cleaned = body.trim();
  return cleaned.length > 0 ? [cleaned] : [];
}

function formatInboxSummary(files: KairosInboxFileSummary[]): string {
  const lines = ["## Agent 收件箱（Main/Lab -> Kairos）"];
  // 只渲染有新消息（或手写 fallback 内容）的来源；全部无新消息时输出占位行
  // （观测增量化：prompt-assembler 在所有来源都无新消息时会整段省略本摘要）。
  const withNew = files.filter((file) => file.includedMessageCount > 0 || file.usedFallback);
  if (withNew.length === 0) {
    lines.push("（自上个 tick 无新消息）");
    return lines.join("\n").trim();
  }
  for (const file of withNew) {
    lines.push("", `### ${SOURCE_LABELS[file.source]} (${file.source}.md)`);
    lines.push(file.content);
    if (file.truncated) {
      lines.push("（已按 V0 inbox 预算截断，仅展示最近/末尾内容）");
    }
  }
  return lines.join("\n").trim();
}

function truncateKeepingEnd(text: string, maxChars: number, marker: string): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= marker.length + 1) return text.slice(-Math.max(0, maxChars));
  return `${marker}\n${text.slice(-(maxChars - marker.length - 1))}`;
}

function sanitizeSingleLine(value: string, fallback = ""): string {
  const normalized = value.replace(/[\r\n|]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeBody(value: string): string {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  return normalized.length > 0 ? normalized : "（无正文）";
}

// ─── 已读水位持久化 ─────────────────────────────────────────────────────

/** 读已读水位文件；不存在 / 损坏时返回空水位（冷启动语义）。 */
export async function loadKairosInboxReadCursor(stateFile: string): Promise<KairosInboxReadCursor> {
  try {
    const raw = await readFile(stateFile, "utf8");
    const parsed = JSON.parse(raw) as { readCursor?: KairosInboxReadCursor };
    return parsed.readCursor ?? {};
  } catch {
    return {};
  }
}

/**
 * 合并写回已读水位（tick 正常闭合后调用）。
 * 从 `KairosInboxSummary.files[].latestMessageTimestamp` 提取每来源最新时间戳。
 */
export async function commitKairosInboxReadCursor(
  stateFile: string,
  summary: KairosInboxSummary,
): Promise<void> {
  const next: KairosInboxReadCursor = {};
  for (const file of summary.files) {
    if (file.latestMessageTimestamp) {
      next[file.source] = file.latestMessageTimestamp;
    }
  }
  if (Object.keys(next).length === 0) return;
  const current = await loadKairosInboxReadCursor(stateFile);
  const merged = { ...current, ...next };
  await mkdir(dirOf(stateFile), { recursive: true });
  const tmp = `${stateFile}.tmp`;
  await writeFile(tmp, JSON.stringify({ readCursor: merged }, null, 2), "utf8");
  const { rename } = await import("node:fs/promises");
  await rename(tmp, stateFile);
}

function dirOf(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx >= 0 ? p.slice(0, idx) : ".";
}

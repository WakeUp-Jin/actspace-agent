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

export interface LoadKairosInboxSummaryInput {
  kairosRoot: string;
  maxMessagesPerFile?: number;
  maxCharsPerFile?: number;
  maxCombinedChars?: number;
}

export interface KairosInboxFileSummary {
  source: KairosInboxSource;
  path: string;
  content: string;
  totalMessageCount: number;
  includedMessageCount: number;
  truncated: boolean;
  missing: boolean;
  warning?: string;
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
      loadInboxFileSummary(input.kairosRoot, source, maxMessagesPerFile, maxCharsPerFile),
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
): Promise<KairosInboxFileSummary> {
  const path = getKairosInboxFilePath(kairosRoot, source);
  try {
    const content = await readFile(path, "utf8");
    const blocks = extractMessageBlocks(content);
    const selected = blocks.length > 0 ? blocks.slice(-maxMessages) : extractFallbackContent(content);
    const joined = selected.join("\n\n").trim();
    const truncatedContent = joined.length > 0
      ? truncateKeepingEnd(joined, maxChars, "…[earlier inbox content truncated]")
      : "（暂无 pending 信号）";
    return {
      source,
      path,
      content: truncatedContent,
      totalMessageCount: blocks.length,
      includedMessageCount: blocks.length > 0 ? Math.min(blocks.length, maxMessages) : 0,
      truncated: blocks.length > maxMessages || (joined.length > 0 && truncatedContent !== joined),
      missing: false,
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
  for (const file of files) {
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

/**
 * Plan 5 prompt-assembler 扩展层。
 *
 * Plan 2 已实现 `config/prompt-assembler.ts::buildConfigTipsBlock`，
 * 本模块在其上叠加 [5][6] 段（观测 + 历史摘要）并最终拼成完整 system prompt。
 *
 * 设计要点：
 * - 每段独立预算截尾，互不影响：
 *     [3] config_tips_block ≤ 600 token  （在 plan 2 内部完成）
 *     [4] user_rules         ≤ 1500 token （在 loader 中完成 rule.md 截尾）
 *     [5] observation_summary ≤ 1200 token
 *     [6] history_summary     ≤ 3000 token
 * - 字符≈token 估算：1 token ≈ 3 字符（与 agent-core/context/token-estimator 对齐）。
 * - 不抛错——任何子段为空时按 "（暂无数据）" 占位。
 */
import {
  buildConfigTipsBlock,
  TOKEN_CHARS_PER_UNIT,
} from "./config/prompt-assembler";
import type { KairosConfig } from "./config/loader";
import type { WatchDiffEntry } from "./context/watch-diff";
import type { SessionsDigestResult } from "./context/sessions-digest";
import type { KairosShortTermLoadResult } from "./context/short-term";
import type { KairosInboxSummary } from "./inbox";
import { KAIROS_SYSTEM_PROMPT } from "./prompt";

export const OBSERVATION_TOKEN_BUDGET = 1200;
export const HISTORY_TOKEN_BUDGET = 3000;
const OBSERVATION_WATCH_MAX_CHARS = 520;
const OBSERVATION_SESSIONS_MAX_CHARS = 520;
const OBSERVATION_INBOX_MAX_CHARS = 2300;

export interface AssembleSystemPromptInput {
  config: KairosConfig;
  watchDiffs: WatchDiffEntry[];
  sessionsDigest: SessionsDigestResult;
  inboxSummary?: KairosInboxSummary;
  shortTermResult: KairosShortTermLoadResult;
  now: Date;
  activeBriefsCount: number;
}

export function assembleSystemPrompt(input: AssembleSystemPromptInput): string {
  const phase = derivePhase(input.now, input.config);
  const configTipsBlock = buildConfigTipsBlock(input.config);
  const observationSummary = truncateByCharBudget(
    buildObservationSummary({
      watchDiffs: input.watchDiffs,
      sessionsDigest: input.sessionsDigest,
      inboxSummary: input.inboxSummary,
    }),
    OBSERVATION_TOKEN_BUDGET * TOKEN_CHARS_PER_UNIT,
  );
  const historySummary = truncateByCharBudget(
    buildHistorySummary({ shortTermResult: input.shortTermResult }),
    HISTORY_TOKEN_BUDGET * TOKEN_CHARS_PER_UNIT,
  );

  const replacements: Record<string, string> = {
    current_time: input.now.toISOString(),
    current_phase: phase,
    active_briefs_count: String(Math.max(0, input.activeBriefsCount)),
    config_tips_block: configTipsBlock,
    user_rules: input.config.ruleMd.trim().length > 0
      ? input.config.ruleMd.trim()
      : "（暂无 rule.md 内容）",
    observation_summary: observationSummary,
    history_summary: historySummary,
  };

  return applyTemplate(KAIROS_SYSTEM_PROMPT, replacements);
}

// ─── §5 观测摘要 ────────────────────────────────────────────────────────

export interface BuildObservationSummaryInput {
  watchDiffs: WatchDiffEntry[];
  sessionsDigest: SessionsDigestResult;
  inboxSummary?: KairosInboxSummary;
}

export function buildObservationSummary(input: BuildObservationSummaryInput): string {
  const sections: string[] = [];
  sections.push(
    truncateByCharBudget(
      buildWatchDiffSummary(input.watchDiffs, input.sessionsDigest.generatedAt),
      OBSERVATION_WATCH_MAX_CHARS,
    ),
  );
  sections.push("");
  sections.push(
    truncateByCharBudget(
      buildSessionsDigestSummary(input.sessionsDigest),
      OBSERVATION_SESSIONS_MAX_CHARS,
    ),
  );
  sections.push("");
  if (input.inboxSummary) {
    sections.push(truncateByCharBudget(input.inboxSummary.text, OBSERVATION_INBOX_MAX_CHARS));
  } else {
    sections.push("## Agent 收件箱（Main/Lab -> Kairos）");
    sections.push("（暂无 inbox 摘要）");
  }

  return sections.join("\n");
}

function buildWatchDiffSummary(watchDiffs: WatchDiffEntry[], generatedAtIso?: string): string {
  const sections: string[] = [];
  const generatedAt = generatedAtIso ? formatHuman(generatedAtIso) : formatHuman(new Date().toISOString());

  sections.push(`## 巡检目录变化（截至 ${generatedAt}）`);
  if (watchDiffs.length === 0) {
    sections.push("（无配置 watch 路径或本次扫描无差异）");
  } else {
    for (const diff of watchDiffs) {
      sections.push(formatWatchDiffEntry(diff));
    }
  }
  return sections.join("\n");
}

function buildSessionsDigestSummary(sessionsDigest: SessionsDigestResult): string {
  const sections: string[] = [];
  sections.push("## 主 Agent 最近 sessions（按 unreadTurnsForKairos 降序）");
  const workspaces = sessionsDigest.workspaces;
  if (workspaces.length === 0) {
    sections.push("（暂无可读 sessions 工作区）");
  } else {
    const flat = workspaces
      .flatMap((w) => w.sessions.map((s) => ({ workspace: w.rootPath, session: s })))
      .sort((a, b) => b.session.unreadTurnsForKairos - a.session.unreadTurnsForKairos);
    if (flat.length === 0) {
      sections.push("（已配置工作区但暂无 session.jsonl）");
    } else {
      for (const { workspace, session } of flat.slice(0, 12)) {
        const preview = session.lastUserPreview ? `  最新 user: "${session.lastUserPreview}"` : "";
        sections.push(
          `- [${baseName(workspace)}] session-${session.id} "${session.title}" ` +
            `(${session.turnCount} turns, ${session.unreadTurnsForKairos} unread)`,
        );
        if (preview) sections.push(preview);
      }
      if (flat.length > 12) {
        sections.push(`- …另有 ${flat.length - 12} 个 session 已省略`);
      }
    }
  }
  return sections.join("\n");
}

function formatWatchDiffEntry(diff: WatchDiffEntry): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`### ${diff.rootPath}`);
  if (diff.totalAdded === 0 && diff.totalRemoved === 0) {
    lines.push("- 无新增 / 删除");
    return lines.join("\n");
  }
  if (diff.added.length > 0) {
    lines.push(`- 新增 ${diff.totalAdded}：`);
    for (const p of diff.added) lines.push(`  - ${p}`);
  } else {
    lines.push(`- 新增 ${diff.totalAdded}`);
  }
  if (diff.removed.length > 0) {
    lines.push(`- 删除 ${diff.totalRemoved}：`);
    for (const p of diff.removed) lines.push(`  - ${p}`);
  } else {
    lines.push(`- 删除 ${diff.totalRemoved}`);
  }
  if (diff.truncated) {
    lines.push("- 注：差异条目已截断；如需完整列表请用 list_directory 工具直接核对");
  }
  return lines.join("\n");
}

// ─── §6 历史摘要 ────────────────────────────────────────────────────────

export interface BuildHistorySummaryInput {
  shortTermResult: KairosShortTermLoadResult;
}

export function buildHistorySummary(input: BuildHistorySummaryInput): string {
  const segments = input.shortTermResult.summarySegments;
  if (segments.length === 0) {
    return "（暂无历史摘要——仍在收集近期 tick 数据中）";
  }
  return segments.map((s) => `### ${s.label}\n${s.text.trim()}`).join("\n\n---\n\n");
}

// ─── 工具函数 ──────────────────────────────────────────────────────────

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (full, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : full;
  });
}

function truncateByCharBudget(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 24))}\n…[truncated for prompt budget]`;
}

/**
 * 由 prompt-assembler 用来给 system [2] 段填 `{current_phase}`，
 * controller.getContextSnapshot 也复用本函数派生 KairosContextPhase。
 */
export function derivePhase(now: Date, config: KairosConfig): "work" | "quiet" | "weekend" | "off" {
  const day = now.getDay();
  if (day === 0 || day === 6) return "weekend";
  const minutes = now.getHours() * 60 + now.getMinutes();
  const wh = config.preferences.rhythm.workHours;
  const qh = config.preferences.rhythm.quietHours;
  if (isWithinWindow(minutes, wh.start, wh.end)) return "work";
  if (isWithinWindow(minutes, qh.start, qh.end)) return "quiet";
  return "off";
}

function isWithinWindow(nowMinutes: number, fromHHMM: string, toHHMM: string): boolean {
  const from = parseHHMM(fromHHMM);
  const to = parseHHMM(toHHMM);
  if (from < 0 || to < 0) return false;
  if (from <= to) return nowMinutes >= from && nowMinutes < to;
  // 跨午夜：例如 quiet 23:00 → 07:00
  return nowMinutes >= from || nowMinutes < to;
}

function parseHHMM(s: string): number {
  const m = /^([0-2]?\d):([0-5]\d)$/.exec(s.trim());
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

function baseName(p: string): string {
  const trimmed = p.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

function formatHuman(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}`;
}

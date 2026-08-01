/**
 * Kairos prompt 组装层。
 *
 * 缓存约束（docs/design-docs/kairos/agent-kairos-prompt-cache-optimization.md）：
 * - `assembleSystemPrompt`：只拼低频内容（静态指令头 / config tips / user rules / 历史摘要），
 *   产出在配置、rule.md、压缩摘要不变时逐字节稳定 → 可被 DeepSeek 前缀缓存复用。
 * - `assembleTickMessage`：每 tick 必变的内容（时间、phase、briefs 数、观测增量、brief 正文）
 *   全部拼进 tick user message，位于上下文动态尾部。
 *
 * 预算约定：
 * - 每段独立预算截尾，互不影响：
 *     [config_tips_block] ≤ 600 token（在 config/prompt-assembler 内部完成）
 *     [user_rules]        ≤ 1500 token（在 loader 中完成 rule.md 截尾）
 *     [history_summary]   ≤ 3000 token
 *     [观测增量]           ≤ 1200 token
 * - 字符≈token 估算：1 token ≈ 3 字符（与 agent-core/context/token-estimator 对齐）。
 * - 不抛错——任何子段为空时按占位/省略处理。
 */
import { KAIROS_DEFAULT_SOUL } from "@actspace/shared";
import {
  buildConfigTipsBlock,
  TOKEN_CHARS_PER_UNIT,
} from "./config/prompt-assembler";
import type { KairosConfig } from "./config/loader";
import type { SessionsDigestResult } from "./context/sessions-digest";
import type { KairosShortTermLoadResult } from "./context/short-term";
import type { KairosInboxSummary } from "./inbox";
import { KAIROS_SYSTEM_PROMPT } from "./prompt";

export const OBSERVATION_TOKEN_BUDGET = 1200;
export const HISTORY_TOKEN_BUDGET = 3000;
const OBSERVATION_SESSIONS_MAX_CHARS = 520;
const OBSERVATION_INBOX_MAX_CHARS = 2300;

// ─── system prompt（仅低频段）────────────────────────────────────────────

/**
 * Kairos 可用 Skill 的 catalog 条目。
 * 由 main 按 `settings.kairos.enabledSkills` 白名单过滤后传入（controller 不做筛选）；
 * 白名单变化时 main 重建 controller，因此对单个 controller 实例这是低频稳定内容。
 */
export interface KairosSkillCatalogEntry {
  name: string;
  description: string;
  /** SKILL.md 绝对路径。 */
  location: string;
  /** Skill 目录绝对路径（已由 controller 并入 allowedRoots）。 */
  directory: string;
}

export interface AssembleSystemPromptInput {
  config: KairosConfig;
  shortTermResult: KairosShortTermLoadResult;
  /** 白名单过滤后的 Skill catalog；缺省 / 空数组 = 不加载任何 Skill。 */
  skillCatalog?: KairosSkillCatalogEntry[];
}

export function assembleSystemPrompt(input: AssembleSystemPromptInput): string {
  const configTipsBlock = buildConfigTipsBlock(input.config);
  const historySummary = truncateByCharBudget(
    buildHistorySummary({ shortTermResult: input.shortTermResult }),
    HISTORY_TOKEN_BUDGET * TOKEN_CHARS_PER_UNIT,
  );

  const replacements: Record<string, string> = {
    soul: input.config.soulMd.trim().length > 0
      ? input.config.soulMd.trim()
      : KAIROS_DEFAULT_SOUL,
    config_tips_block: configTipsBlock,
    skill_catalog: renderKairosSkillCatalog(input.skillCatalog ?? []),
    user_rules: input.config.ruleMd.trim().length > 0
      ? input.config.ruleMd.trim()
      : "（暂无 rule.md 内容）",
    history_summary: historySummary,
  };

  return applyTemplate(KAIROS_SYSTEM_PROMPT, replacements);
}

/**
 * 渲染 Kairos 的 Skill catalog 段。
 *
 * 与主 Agent 的 `<available_skills>` XML 相比刻意精简（Kairos 上下文预算紧张）：
 * 每个 Skill 三行（name / description / SKILL.md 路径）+ 一句使用指引。
 */
export function renderKairosSkillCatalog(entries: KairosSkillCatalogEntry[]): string {
  if (entries.length === 0) {
    return "（无已启用 Skill——用户尚未在设置页为你开启任何 Skill）";
  }
  const lines: string[] = [];
  for (const entry of entries) {
    lines.push(`- ${entry.name}：${entry.description}`);
    lines.push(`  SKILL.md：${entry.location}`);
  }
  lines.push("");
  lines.push(
    "当任务与某个 Skill 的描述匹配时，先用 read_file 读它的 SKILL.md 再按指引行动；上面列出的路径都在你的可读范围内。",
  );
  lines.push(
    "特别地：若某个 Skill 的描述表明它是**持续更新的数据源**（如监听日志、采集结果），不要等任务匹配——每次唤醒都应主动查看它的最新输出，把值得注意的变化纳入本 tick 的判断。",
  );
  return lines.join("\n");
}

// ─── tick message（动态尾部）────────────────────────────────────────────

/** tick 消息「任务表」行需要的最小 brief 信息（来自 briefs index 的 active 条目）。 */
export interface KairosActiveBriefInfo {
  id: string;
  /** ISO 时间；null = 尚未排期（首次 interval 任务会立即投递）。 */
  nextRun: string | null;
}

/**
 * tick message 固定后缀。
 *
 * 每条 tick 消息末尾原样携带：系统提示词在长上下文里离决策点太远（会被历史稀释），
 * 这几行贴着模型每 tick 必读的位置，把例程的关键约束钉在决策点旁边。
 * 必须保持简短（历史里每条 tick 消息都会重复携带它）且逐 tick 完全一致。
 */
export const TICK_MESSAGE_REMINDER = [
  "---",
  "提醒：观测增量不含持续数据源型 Skill（如 fs-watch）的输出，需按例程自行读取；",
  "发现变化对照「场景应对」行动并留下笔记或汇报；全部安静才允许直接 sleep。",
].join("\n");

export interface AssembleTickMessageInput {
  now: Date;
  phase: "work" | "quiet" | "weekend" | "off";
  /** 当前 active 状态的 briefs；渲染成「任务表」行让 Kairos 看到自己的排班。 */
  activeBriefs: KairosActiveBriefInfo[];
  sessionsDigest: SessionsDigestResult;
  inboxSummary?: KairosInboxSummary;
  /**
   * dispatcher 投递的触发正文：brief tick 为 brief 正文；auto tick 为空字符串。
   * 非空时以「## 任务正文」节注入。
   */
  triggerContent?: string;
}

/** 「任务表」行渲染上限：防止大量 brief 把 tick message 撑爆。 */
const TICK_BRIEFS_MAX_ITEMS = 8;

/**
 * 组装 tick 注入的 user message 全文。
 *
 * 关键约束：返回值会**同时**写入 `kairos_tick_injected.payload.content` 和发送给
 * LLM 的 user message——发送 = 落盘 = 重放必须是同一字符串。
 */
export function assembleTickMessage(input: AssembleTickMessageInput): string {
  const ts = formatMinute(input.now);
  const lines: string[] = [
    "<tick>",
    `[当前时间] ${ts}（${input.phase}）`,
    `[任务表] ${renderActiveBriefsLine(input.activeBriefs)}`,
  ];

  const observation = truncateByCharBudget(
    buildObservationDelta({
      sessionsDigest: input.sessionsDigest,
      inboxSummary: input.inboxSummary,
    }),
    OBSERVATION_TOKEN_BUDGET * TOKEN_CHARS_PER_UNIT,
  );
  lines.push("", "## 观测增量");
  lines.push(observation.length > 0 ? observation : "（自上个 tick 无新观测）");

  const trigger = input.triggerContent?.trim() ?? "";
  if (trigger.length > 0) {
    lines.push("", "## 任务正文", trigger);
  }

  lines.push("", TICK_MESSAGE_REMINDER);
  lines.push("</tick>");
  return lines.join("\n");
}

/** 渲染「任务表」行：`id（下次 MM-DD HH:mm）` 逗号连接；空表输出「空」。 */
function renderActiveBriefsLine(briefs: KairosActiveBriefInfo[]): string {
  if (briefs.length === 0) return "空";
  const items = briefs.slice(0, TICK_BRIEFS_MAX_ITEMS).map((b) => {
    const next = b.nextRun ? formatBriefNextRun(b.nextRun) : "待排期";
    return `${b.id}（下次 ${next}）`;
  });
  const more = briefs.length > TICK_BRIEFS_MAX_ITEMS
    ? `，…另有 ${briefs.length - TICK_BRIEFS_MAX_ITEMS} 项`
    : "";
  return `${briefs.length} 项：${items.join("、")}${more}`;
}

function formatBriefNextRun(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "待排期";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

// ─── 观测增量渲染 ───────────────────────────────────────────────────────

export interface BuildObservationDeltaInput {
  sessionsDigest: SessionsDigestResult;
  inboxSummary?: KairosInboxSummary;
}

/**
 * 渲染「自上个 tick 以来的观测增量」。
 *
 * 来源只有两个：sessions digest（主 Agent 新活动）+ Agent inbox。
 * 目录变化感知已归口到 fs-watch 插件（Skill 形态，由 Kairos 例程主动读取），
 * 不再有巡检（watch-scanner/watch-diff）管道。
 *
 * 与旧版全量快照的区别：空节直接省略而不是输出占位符；全部为空时返回空字符串，
 * 由 `assembleTickMessage` 统一输出「无新观测」。这保证历史里每个 tick 消息
 * 记录的都是当时的新信息，重放时无冗余快照。
 */
export function buildObservationDelta(input: BuildObservationDeltaInput): string {
  const sections: string[] = [];

  const sessionsSection = buildSessionsDigestSummary(input.sessionsDigest);
  if (sessionsSection.length > 0) {
    sections.push(truncateByCharBudget(sessionsSection, OBSERVATION_SESSIONS_MAX_CHARS));
  }

  if (input.inboxSummary && inboxHasNewMessages(input.inboxSummary)) {
    sections.push(
      truncateByCharBudget(input.inboxSummary.text, OBSERVATION_INBOX_MAX_CHARS),
    );
  }

  return sections.join("\n\n");
}

function inboxHasNewMessages(summary: KairosInboxSummary): boolean {
  return summary.files.some((file) => file.includedMessageCount > 0 || file.usedFallback);
}

/** 只渲染有未读 turn 的 session；全部已读时返回空字符串（节被省略）。 */
function buildSessionsDigestSummary(sessionsDigest: SessionsDigestResult): string {
  const unread = sessionsDigest.workspaces
    .flatMap((w) => w.sessions.map((s) => ({ workspace: w.rootPath, session: s })))
    .filter((x) => x.session.unreadAgentRunsForKairos > 0)
    .sort((a, b) => b.session.unreadAgentRunsForKairos - a.session.unreadAgentRunsForKairos);
  if (unread.length === 0) return "";

  const sections: string[] = ["## 主 Agent 有未读 Agent Run 的 sessions（按未读数降序）"];
  for (const { workspace, session } of unread.slice(0, 12)) {
    sections.push(
      `- [${baseName(workspace)}] session-${session.id} "${session.title}" ` +
        `(${session.agentRunCount} agent runs, ${session.unreadAgentRunsForKairos} unread)`,
    );
    if (session.lastUserPreview) {
      sections.push(`  最新 user: "${session.lastUserPreview}"`);
    }
  }
  if (unread.length > 12) {
    sections.push(`- …另有 ${unread.length - 12} 个 session 已省略`);
  }
  return sections.join("\n");
}

// ─── 历史摘要 ───────────────────────────────────────────────────────────

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

/** 分钟粒度时间（YYYY-MM-DD HH:mm）；秒级精度对 Kairos 决策无价值，只会增加噪音。 */
export function formatMinute(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

/**
 * 由 tick message 用来填当前 phase，
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

import { getContextBucketDisplay, type ContextState, type ContextPanelBucketKey, type ContextPanelBucketTokens, type ContextPanelConversationKind, type ContextPanelEntry, type ContextPanelView } from "@actspace/shared";
import { mockContextPaths, mockDisclosureSummary } from "./context-paths-fixture";
import type { MockSession } from "./mock-db";

/** 默认场景的披露路径：87 条活跃、342 条睡眠，第 4 周期。 */
export const MOCK_CONTEXT_PATHS = mockContextPaths();
export const MOCK_CONTEXT_PATHS_REVISION = "mock-paths";

/**
 * 浏览器 mock 的 Context 面板完整数据，内容照 `docs/design-docs/frontend/context-panel-demo.html`。
 * 会话内容里最新的用户 / 助手条目借用 mock 会话真实的 messageId，浏览器里点「跳到轨迹」能命中。
 */

const schema = (name: string, source: string) => JSON.stringify({
  name,
  description: `${name} tool provided by ${source}.`,
  input_schema: { type: "object", properties: { path: { type: "string", description: "Target path" } }, required: ["path"] },
}, null, 2);

const TOOLS: [string, string, number][] = [
  ["bash", "内置", 1480], ["edit_file", "内置", 1210], ["read_file", "内置", 820], ["write_file", "内置", 640], ["grep", "内置", 760], ["glob", "内置", 420],
  ["web_fetch", "内置", 530], ["web_search", "内置", 470], ["agent", "内置", 1340], ["todo_write", "内置", 690],
  ["browser_navigate", "browser", 380], ["browser_click", "browser", 360], ["browser_snapshot", "browser", 410], ["browser_type", "browser", 350],
  ["github_create_pr", "mcp:github", 520], ["github_list_issues", "mcp:github", 480], ["github_get_file", "mcp:github", 440],
  ["linear_search", "mcp:linear", 390], ["linear_update_issue", "mcp:linear", 450],
  ["imagegen", "插件:imagegen", 610],
];

/** [类型, 标题, tokens, 本次新增]；工具调用与结果成对，共用 callId。 */
const CONVERSATION: [ContextPanelConversationKind, string, number, boolean?][] = [
  ["user", "帮我把设置页的模型列表重新设计一下", 38],
  ["thinking", "先看 ModelSettings.tsx 的 ModelMultiSelector 实现", 96],
  ["tool-call", "read_file · ModelSettings.tsx", 42],
  ["tool-result", "read_file · ModelSettings.tsx（117 行）", 3820],
  ["tool-call", "read_file · SettingsPrimitives.tsx", 40],
  ["tool-result", "read_file · SettingsPrimitives.tsx（812 行）", 9640],
  ["assistant", "ModelMultiSelector 用 labels.join(\", \") 渲染触发器…", 412],
  ["tool-call", "grep · \"act-context\"", 36],
  ["tool-result", "grep · 7 个文件匹配", 610],
  ["user", "右侧栏的 context 也一起看看", 22],
  ["tool-call", "bash · gh repo clone bowenliang123/dsh-context", 58],
  ["tool-result", "bash · 正克隆到 'dsh-context'…", 120],
  ["tool-call", "read_file · README.md", 34],
  ["tool-result", "read_file · README.md（214 行）", 6120],
  ["tool-call", "read_file · contextView.tsx", 36],
  ["tool-result", "read_file · contextView.tsx（640 行）", 8930],
  ["assistant", "两边都摸清了，下面是现状、可借鉴的地方和建议…", 2140],
  ["user", "设置页我没表示清楚，是选择之后模型显示在输入框里…", 164],
  ["thinking", "明白，先做右侧栏 demo", 180],
  ["tool-call", "read_file · tokens.css", 34, true],
  ["tool-result", "read_file · tokens.css（560 行）", 7420, true],
  ["tool-call", "write_file · context-panel-demo.html", 4860, true],
  ["tool-result", "write_file · 已写入", 40, true],
];

function conversationEntries(session: MockSession | undefined): { entries: ContextPanelEntry[]; newKeys: Set<string> } {
  const newKeys = new Set<string>();
  let call = 0;
  const entries = CONVERSATION.map(([kind, title, tokens, isNew], index): ContextPanelEntry => {
    if (kind === "tool-call") call += 1;
    const callId = `mock-call-${call}`;
    const isTool = kind === "tool-call" || kind === "tool-result";
    const key = isTool ? `${callId}:${kind === "tool-call" ? "call" : "result"}` : `mock-message-${index}`;
    if (isNew) newKeys.add(key);
    return {
      key,
      bucket: "conversation",
      title,
      estimatedTokens: tokens,
      kind,
      trajectoryRef: isTool ? { callId } : { messageId: `mock-message-${index}` },
    };
  });
  // 最新的用户 / 助手条目换成 mock 会话真实的 messageId（从后往前一一对应）。
  const real = { user: [...(session?.messages ?? [])].filter((m) => m.role === "user").reverse(), assistant: [...(session?.messages ?? [])].filter((m) => m.role === "assistant").reverse() };
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!;
    const role = entry.kind === "user" ? "user" : entry.kind === "assistant" || entry.kind === "thinking" ? "assistant" : null;
    const message = role ? real[role].shift() : undefined;
    if (message) entries[index] = { ...entry, trajectoryRef: { messageId: message.id } };
  }
  return { entries, newKeys };
}

function sumBuckets(entries: { bucket: ContextPanelBucketKey; estimatedTokens: number }[]): ContextPanelBucketTokens {
  const buckets: ContextPanelBucketTokens = {};
  for (const entry of entries) buckets[entry.bucket] = (buckets[entry.bucket] ?? 0) + entry.estimatedTokens;
  return buckets;
}

const TREND_TOTALS = [18, 24, 31, 38, 44, 52, 61, 70, 79, 88, 97, 108, 121, 136, 152, 160, 34, 41, 47, 52, 58, 63, 70, 76, 82];
const SHARE_BEFORE: [ContextPanelBucketKey, number][] = [["systemPrompt", 0.05], ["tools", 0.15], ["rules", 0.04], ["skills", 0.03], ["conversation", 0.73]];
const SHARE_AFTER: [ContextPanelBucketKey, number][] = [["systemPrompt", 0.05], ["tools", 0.15], ["rules", 0.04], ["skills", 0.03], ["summarizedConversation", 0.06], ["conversation", 0.67]];
const COMPACTED_AT = 16;

/** Composer and panel share the same complete mock totals, independent of entry paging. */
export function mockContextState(view: ContextPanelView): ContextState {
  const maxTokens = view.model.contextWindow ?? 0;
  return {
    sessionId: view.sessionId,
    throughJournalSeq: view.throughJournalSeq,
    basis: "current-request",
    updatedAt: "2026-10-11T10:58:00.000Z",
    estimator: { name: "mock", version: "1" },
    totalEstimatedTokens: view.current.totalEstimatedTokens,
    maxTokens,
    percentUsed: maxTokens > 0 ? Math.min(100, view.current.totalEstimatedTokens / maxTokens * 100) : 0,
    buckets: Object.entries(view.current.buckets).map(([key, tokens]) => ({
      key: key as ContextPanelBucketKey,
      name: key as ContextPanelBucketKey,
      label: getContextBucketDisplay(key).label,
      tokens: tokens ?? 0,
    })),
    entries: [],
  };
}

export function mockContextPanelView(sessionId: string, session?: MockSession): ContextPanelView {
  const base: ContextPanelEntry[] = [
    { key: "system:main", bucket: "systemPrompt", title: "ActSpace 系统提示词", estimatedTokens: 4210, preview: "You are ActSpace, an agent that works inside the user's workspace.\n\n# Tone\n- 先讨论，再执行…\n\n# Environment\nPlatform: darwin", fullTextAvailable: true },
    ...TOOLS.map(([name, source, tokens]): ContextPanelEntry => ({ key: `tool:${name}`, bucket: "tools", title: name, source, estimatedTokens: tokens, preview: schema(name, source) })),
    { key: "rule:AGENTS.md", bucket: "rules", title: "AGENTS.md", source: "仓库", estimatedTokens: 1680, preview: "# actspace-agent\n\n这个仓库是一个面向 Agent 协作开发的基础模板。\n\n## 每轮开始先读\n- docs/REPO_COLLAB_GUIDE.md\n- docs/ARCHITECTURE.md", fullTextAvailable: true },
    { key: "rule:~/.claude/CLAUDE.md", bucket: "rules", title: "~/.claude/CLAUDE.md", source: "全局", estimatedTokens: 980, preview: "## 先讨论，再执行\n- 用户说“讨论”“一起梳理”时只做讨论…" },
    { key: "rule:front-新功能开发清单.md", bucket: "rules", title: "docs/design-docs/frontend/front-新功能开发清单.md", source: "引用", estimatedTokens: 440, preview: "新增或改动前端功能前必读…" },
    { key: "skill:catalog", bucket: "skills", title: "可用 Skills 目录", source: "目录", estimatedTokens: 620, preview: "- ui: Produces distinctive, production-grade UI…\n- hunt: Finds root cause before applying fixes…" },
    { key: "skill:invoke:ui", bucket: "skills", title: "/ui", source: "调用", estimatedTokens: 1180, preview: "# ui skill\n\nUse the existing design tokens. Avoid generic AI aesthetics…" },
    { key: "compaction:1", bucket: "summarizedConversation", title: "第 1–7 轮摘要（压缩于 10:42）", estimatedTokens: 5420, preview: "## 已完成\n- 定位 ModelSettings.tsx / ContextRenderView.tsx\n\n## 已确认的决定\n- 先讨论再执行\n- 右侧栏先出 HTML demo" },
  ];
  const conversation = conversationEntries(session);
  const entries = [...base, ...conversation.entries];
  const newKeys = new Set([...conversation.newKeys, "skill:invoke:ui"]);
  const previousEntries = [
    ...entries.filter((entry) => !newKeys.has(entry.key)).map(({ key, bucket, estimatedTokens }) => ({ key, bucket, estimatedTokens })),
    { key: "tool:notebook_edit", bucket: "tools" as const, estimatedTokens: 540 },
  ];
  const total = entries.reduce((sum, entry) => sum + entry.estimatedTokens, 0);
  const previousTotal = previousEntries.reduce((sum, entry) => sum + entry.estimatedTokens, 0);
  // 趋势的最后一根柱就是对比基准（上次请求），明细头部的「上次请求实际」从它读。
  const trendTotals = [...TREND_TOTALS.map((k) => k * 1000), previousTotal];
  const lastRequestId = `mock-request-${trendTotals.length}`;

  return {
    schemaVersion: 2,
    sessionId,
    logicalAgentScopeId: "main",
    contextRevision: 47,
    throughJournalSeq: 1,
    model: { modelKey: "anthropic:claude-opus-5-5", label: "Claude Opus 5.5", contextWindow: 200_000, autoCompactAtTokens: 160_000 },
    disclosure: mockDisclosureSummary(MOCK_CONTEXT_PATHS, MOCK_CONTEXT_PATHS_REVISION),
    current: { totalEstimatedTokens: total, buckets: sumBuckets(entries), entries, status: "ready" },
    previous: { requestId: lastRequestId, turnIndex: 8, stepIndex: 47, sentAt: "2026-10-11T10:58:00.000Z", totalEstimatedTokens: previousTotal, buckets: sumBuckets(previousEntries), entries: previousEntries },
    stats: {
      turnCount: 8,
      stepCount: 47,
      compactionCount: 1,
      cumulativeUsage: { inputTokens: 98_400, outputTokens: 41_200, cacheReadTokens: 1_602_000, cacheWriteTokens: 78_400 },
      costUsd: 0.42,
    },
    trend: trendTotals.map((estimated, index) => {
      const shares = index >= COMPACTED_AT ? SHARE_AFTER : SHARE_BEFORE;
      const last = index === trendTotals.length - 1;
      return {
        requestId: `mock-request-${index + 1}`,
        turnIndex: last ? 8 : Math.min(8, 1 + Math.floor(index / 3.3)),
        stepIndex: last ? 47 : index * 2 - 3 > 0 ? index * 2 - 3 : index + 1,
        sentAt: new Date(Date.UTC(2026, 9, 11, 10, index * 2)).toISOString(),
        estimatedTokens: estimated,
        buckets: Object.fromEntries(shares.map(([key, share]) => [key, Math.round(estimated * share)])),
        actual: { inputTokens: Math.round(estimated * 0.07), outputTokens: 900, cacheReadTokens: Math.round(estimated * 0.86), cacheWriteTokens: 1200 },
        ...(index === COMPACTED_AT ? { compactedBefore: { compactionId: "compaction:1", reclaimedTokens: 118_000 } } : {}),
      };
    }),
    events: [
      { id: "ev-6", kind: "inject", label: "Skill 调用 · /ui", source: "ui", tokenDelta: 1180, turnIndex: 8, stepIndex: 44, at: "2026-10-11T10:56:00.000Z" },
      { id: "ev-5", kind: "inject", label: "规则 · front-新功能开发清单.md", tokenDelta: 440, turnIndex: 8, stepIndex: 41, at: "2026-10-11T10:52:00.000Z" },
      { id: "ev-4", kind: "tools-changed", label: "工具集变更 · 移除 notebook_edit", tokenDelta: -540, turnIndex: 8, stepIndex: 40, at: "2026-10-11T10:50:00.000Z" },
      { id: "ev-3", kind: "compact", label: "自动压缩 · 第 1–7 轮 → 摘要", tokenDelta: -118_000, turnIndex: 7, stepIndex: null, at: "2026-10-11T10:42:00.000Z" },
      { id: "ev-2", kind: "model-switch", label: "切换模型 · Sonnet 5.5 → Opus 5.5", tokenDelta: null, turnIndex: 3, stepIndex: null, at: "2026-10-11T10:12:00.000Z" },
      { id: "ev-1", kind: "inject", label: "规则 · AGENTS.md / CLAUDE.md", tokenDelta: 2660, turnIndex: 1, stepIndex: 1, at: "2026-10-11T10:00:00.000Z" },
    ],
  };
}

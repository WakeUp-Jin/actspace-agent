import { describe, it, expect } from "vitest";
import {
  assembleSystemPrompt,
  assembleTickMessage,
  buildHistorySummary,
  buildObservationDelta,
} from "../prompt-assembler";
import {
  DEFAULT_BLOCKLIST,
  DEFAULT_PATHS_CONFIG,
  DEFAULT_PREFERENCES,
} from "../config/schema";
import type { KairosConfig } from "../config/loader";
import type { WatchDiffEntry } from "../context/watch-diff";
import type { SessionsDigestResult } from "../context/sessions-digest";
import type { KairosShortTermLoadResult } from "../context/short-term";
import type { KairosInboxSummary } from "../inbox";

function baseConfig(): KairosConfig {
  return {
    preferences: { ...DEFAULT_PREFERENCES, enabled: true },
    paths: {
      ...DEFAULT_PATHS_CONFIG,
      paths: [
        { path: "/tmp/work/docs", watch: true, tip: "design docs" },
        { path: "/tmp/work/data", watch: false, tip: "data inbox" },
      ],
    },
    blocklist: { ...DEFAULT_BLOCKLIST },
    ruleMd: "请保持简洁。",
    warnings: [],
  };
}

function emptyShortTerm(): KairosShortTermLoadResult {
  return { messages: [], summarySegments: [], loadedTokenEstimate: 0 };
}

function emptyDigest(): SessionsDigestResult {
  return { workspaces: [], generatedAt: "2026-05-27T19:00:00.000Z" };
}

function sampleWatchDiffs(): WatchDiffEntry[] {
  return [
    {
      rootPath: "/tmp/work/docs",
      added: ["/tmp/work/docs/a.md", "/tmp/work/docs/b.md"],
      removed: [],
      truncated: false,
      totalAdded: 2,
      totalRemoved: 0,
    },
  ];
}

function sampleDigest(): SessionsDigestResult {
  return {
    generatedAt: "2026-05-27T19:00:00.000Z",
    workspaces: [
      {
        rootPath: "/tmp/work/sessions",
        sessions: [
          {
            id: "s1",
            title: "Kairos design",
            updatedAt: "2026-05-27T18:00:00.000Z",
            turnCount: 10,
            unreadTurnsForKairos: 3,
            lastUserPreview: "上下文如何注入？",
          },
          {
            id: "s2",
            title: "Other",
            updatedAt: "2026-05-27T17:00:00.000Z",
            turnCount: 5,
            unreadTurnsForKairos: 1,
            lastUserPreview: "Hi",
          },
          {
            id: "s3",
            title: "All read",
            updatedAt: "2026-05-27T16:00:00.000Z",
            turnCount: 4,
            unreadTurnsForKairos: 0,
            lastUserPreview: "done",
          },
        ],
      },
    ],
  };
}

function sampleInboxSummary(): KairosInboxSummary {
  return {
    text: [
      "## Agent 收件箱（Main/Lab -> Kairos）",
      "",
      "### Main Agent (main-agent.md)",
      "### 2026-06-02T03:50:00.000Z | priority: normal | topic: 前端验证反复失败",
      "请 Kairos 后续观察这个重复失败。",
    ].join("\n"),
    files: [
      {
        source: "main-agent",
        path: "/tmp/kairos/inbox/main-agent.md",
        content: "请 Kairos 后续观察这个重复失败。",
        totalMessageCount: 1,
        includedMessageCount: 1,
        truncated: false,
        missing: false,
      },
    ],
    truncated: false,
    warnings: [],
  } as KairosInboxSummary;
}

function emptyInboxSummary(): KairosInboxSummary {
  return {
    text: "## Agent 收件箱（Main/Lab -> Kairos）\n（暂无 pending 信号）",
    files: [
      {
        source: "main-agent",
        path: "/tmp/kairos/inbox/main-agent.md",
        content: "（暂无 pending 信号）",
        totalMessageCount: 0,
        includedMessageCount: 0,
        truncated: false,
        missing: false,
      },
    ],
    truncated: false,
    warnings: [],
  } as KairosInboxSummary;
}

describe("buildObservationDelta", () => {
  it("renders watch diff and unread sessions, skipping all-read sessions", () => {
    const text = buildObservationDelta({
      watchDiffs: sampleWatchDiffs(),
      sessionsDigest: sampleDigest(),
    });
    expect(text).toContain("巡检目录变化");
    expect(text).toContain("/tmp/work/docs");
    expect(text).toContain("新增 2");
    expect(text).toContain("a.md");
    // 排序按 unread 降序：s1 在前；s3 已读不出现
    const s1Idx = text.indexOf("session-s1");
    const s2Idx = text.indexOf("session-s2");
    expect(s1Idx).toBeGreaterThan(-1);
    expect(s2Idx).toBeGreaterThan(s1Idx);
    expect(text).not.toContain("session-s3");
  });

  it("returns empty string when nothing changed (no placeholder noise)", () => {
    const text = buildObservationDelta({
      watchDiffs: [
        {
          rootPath: "/tmp/work/docs",
          added: [],
          removed: [],
          truncated: false,
          totalAdded: 0,
          totalRemoved: 0,
        },
      ],
      sessionsDigest: emptyDigest(),
      inboxSummary: emptyInboxSummary(),
    });
    expect(text).toBe("");
  });

  it("includes inbox section only when it has new messages", () => {
    const withNew = buildObservationDelta({
      watchDiffs: [],
      sessionsDigest: emptyDigest(),
      inboxSummary: sampleInboxSummary(),
    });
    expect(withNew).toContain("Agent 收件箱");
    expect(withNew).toContain("前端验证反复失败");

    const withoutNew = buildObservationDelta({
      watchDiffs: [],
      sessionsDigest: emptyDigest(),
      inboxSummary: emptyInboxSummary(),
    });
    expect(withoutNew).not.toContain("Agent 收件箱");
  });
});

describe("assembleTickMessage", () => {
  it("renders minute-granularity time, phase, briefs count and observation delta", () => {
    const msg = assembleTickMessage({
      now: new Date("2026-05-27T13:00:42"),
      phase: "work",
      activeBriefsCount: 2,
      watchDiffs: sampleWatchDiffs(),
      sessionsDigest: sampleDigest(),
      inboxSummary: sampleInboxSummary(),
    });
    expect(msg).toContain("<tick>");
    expect(msg).toContain("</tick>");
    // 分钟粒度：不含秒
    expect(msg).toContain("[当前时间] 2026-05-27 13:00（work）");
    expect(msg).not.toContain("13:00:42");
    expect(msg).toContain("[活跃 briefs] 2 个");
    expect(msg).toContain("## 观测增量");
    expect(msg).toContain("巡检目录变化");
    expect(msg).toContain("session-s1");
    expect(msg).toContain("前端验证反复失败");
  });

  it("renders fallback line when there is no new observation", () => {
    const msg = assembleTickMessage({
      now: new Date("2026-05-27T13:00:00"),
      phase: "work",
      activeBriefsCount: 0,
      watchDiffs: [],
      sessionsDigest: emptyDigest(),
      inboxSummary: emptyInboxSummary(),
    });
    expect(msg).toContain("（自上个 tick 无新观测）");
  });

  it("embeds brief trigger content as 任务正文 section", () => {
    const msg = assembleTickMessage({
      now: new Date("2026-05-27T13:00:00"),
      phase: "work",
      activeBriefsCount: 1,
      watchDiffs: [],
      sessionsDigest: emptyDigest(),
      triggerContent: "# 周报整理\n请汇总本周 sessions。",
    });
    expect(msg).toContain("## 任务正文");
    expect(msg).toContain("# 周报整理");
  });

  it("omits 任务正文 for auto ticks (empty trigger content)", () => {
    const msg = assembleTickMessage({
      now: new Date("2026-05-27T13:00:00"),
      phase: "work",
      activeBriefsCount: 0,
      watchDiffs: [],
      sessionsDigest: emptyDigest(),
      triggerContent: "",
    });
    expect(msg).not.toContain("## 任务正文");
  });
});

describe("buildHistorySummary", () => {
  it("returns placeholder when empty", () => {
    const text = buildHistorySummary({ shortTermResult: emptyShortTerm() });
    expect(text).toContain("暂无历史摘要");
  });

  it("joins segments with separator and label heading", () => {
    const r: KairosShortTermLoadResult = {
      messages: [],
      summarySegments: [
        { label: "week_05-20_to_05-26", text: "week summary body", path: "/tmp/week.summary.md" },
        { label: "year_2025", text: "year summary body", path: "/tmp/year.summary.md" },
      ],
      loadedTokenEstimate: 0,
    };
    const text = buildHistorySummary({ shortTermResult: r });
    expect(text).toContain("### week_05-20_to_05-26");
    expect(text).toContain("week summary body");
    expect(text).toContain("---");
    expect(text).toContain("### year_2025");
  });
});

describe("assembleSystemPrompt", () => {
  it("contains only low-frequency content and no leftover placeholders", () => {
    const prompt = assembleSystemPrompt({
      config: baseConfig(),
      shortTermResult: emptyShortTerm(),
    });
    expect(prompt).toContain("You are Kairos");
    expect(prompt).toContain("配置提示");
    expect(prompt).toContain("# Workspace boundary");
    expect(prompt).toContain("不要默认读写 actspace app 仓库");
    expect(prompt).toContain("# 用户规则");
    expect(prompt).toContain("请保持简洁。");
    expect(prompt).toContain("# 历史摘要");
    // 不残留任何未替换占位符
    expect(prompt.match(/\{\w+\}/g)).toBeNull();
    // 总长上限：6300 token ≈ 18900 chars
    expect(prompt.length).toBeLessThan(18900);
  });

  it("is byte-stable across calls regardless of wall clock (cacheable prefix)", () => {
    const a = assembleSystemPrompt({ config: baseConfig(), shortTermResult: emptyShortTerm() });
    const b = assembleSystemPrompt({ config: baseConfig(), shortTermResult: emptyShortTerm() });
    expect(a).toBe(b);
    // 每 tick 必变的内容禁止进入 system prompt
    expect(a).not.toContain("[当前时间]");
    expect(a).not.toContain("[活跃 briefs]");
    expect(a).not.toContain("# 观测摘要");
  });
});

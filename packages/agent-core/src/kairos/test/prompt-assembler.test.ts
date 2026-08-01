import { describe, it, expect } from "vitest";
import {
  assembleSystemPrompt,
  assembleTickMessage,
  buildHistorySummary,
  buildObservationDelta,
  renderKairosSkillCatalog,
} from "../prompt-assembler";
import {
  DEFAULT_BLOCKLIST,
  DEFAULT_PATHS_CONFIG,
  DEFAULT_PREFERENCES,
} from "../config/schema";
import type { KairosConfig } from "../config/loader";
import type { SessionsDigestResult } from "../context/sessions-digest";
import type { KairosShortTermLoadResult } from "../context/short-term";
import type { KairosInboxSummary } from "../inbox";

function baseConfig(): KairosConfig {
  return {
    preferences: { ...DEFAULT_PREFERENCES, enabled: true },
    paths: {
      ...DEFAULT_PATHS_CONFIG,
      paths: [
        { path: "/tmp/work/docs", tip: "design docs" },
        { path: "/tmp/work/data", tip: "data inbox" },
      ],
    },
    blocklist: { ...DEFAULT_BLOCKLIST },
    ruleMd: "请保持简洁。",
    soulMd: "",
    warnings: [],
  };
}

function emptyShortTerm(): KairosShortTermLoadResult {
  return { messages: [], summarySegments: [], loadedTokenEstimate: 0 };
}

function emptyDigest(): SessionsDigestResult {
  return { workspaces: [], generatedAt: "2026-05-27T19:00:00.000Z" };
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
            agentRunCount: 10,
            unreadAgentRunsForKairos: 3,
            lastUserPreview: "上下文如何注入？",
          },
          {
            id: "s2",
            title: "Other",
            updatedAt: "2026-05-27T17:00:00.000Z",
            agentRunCount: 5,
            unreadAgentRunsForKairos: 1,
            lastUserPreview: "Hi",
          },
          {
            id: "s3",
            title: "All read",
            updatedAt: "2026-05-27T16:00:00.000Z",
            agentRunCount: 4,
            unreadAgentRunsForKairos: 0,
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
  it("renders unread sessions in descending order, skipping all-read sessions", () => {
    const text = buildObservationDelta({
      sessionsDigest: sampleDigest(),
    });
    // 排序按 unread 降序：s1 在前；s3 已读不出现
    const s1Idx = text.indexOf("session-s1");
    const s2Idx = text.indexOf("session-s2");
    expect(s1Idx).toBeGreaterThan(-1);
    expect(s2Idx).toBeGreaterThan(s1Idx);
    expect(text).not.toContain("session-s3");
  });

  it("returns empty string when nothing changed (no placeholder noise)", () => {
    const text = buildObservationDelta({
      sessionsDigest: emptyDigest(),
      inboxSummary: emptyInboxSummary(),
    });
    expect(text).toBe("");
  });

  it("includes inbox section only when it has new messages", () => {
    const withNew = buildObservationDelta({
      sessionsDigest: emptyDigest(),
      inboxSummary: sampleInboxSummary(),
    });
    expect(withNew).toContain("Agent 收件箱");
    expect(withNew).toContain("前端验证反复失败");

    const withoutNew = buildObservationDelta({
      sessionsDigest: emptyDigest(),
      inboxSummary: emptyInboxSummary(),
    });
    expect(withoutNew).not.toContain("Agent 收件箱");
  });
});

describe("assembleTickMessage", () => {
  it("renders minute-granularity time, phase, briefs schedule and observation delta", () => {
    const msg = assembleTickMessage({
      now: new Date("2026-05-27T13:00:42"),
      phase: "work",
      activeBriefs: [
        { id: "weekly-report", nextRun: "2026-05-27T15:30:00" },
        { id: "inbox-triage", nextRun: null },
      ],
      sessionsDigest: sampleDigest(),
      inboxSummary: sampleInboxSummary(),
    });
    expect(msg).toContain("<tick>");
    expect(msg).toContain("</tick>");
    // 分钟粒度：不含秒
    expect(msg).toContain("[当前时间] 2026-05-27 13:00（work）");
    expect(msg).not.toContain("13:00:42");
    // 任务表行：数量 + 逐项 id 与下次时间；未排期显示「待排期」
    expect(msg).toContain("[任务表] 2 项：weekly-report（下次 05-27 15:30）、inbox-triage（下次 待排期）");
    expect(msg).toContain("## 观测增量");
    expect(msg).toContain("session-s1");
    expect(msg).toContain("前端验证反复失败");
  });

  it("renders 空 when no active briefs", () => {
    const msg = assembleTickMessage({
      now: new Date("2026-05-27T13:00:00"),
      phase: "work",
      activeBriefs: [],
      sessionsDigest: emptyDigest(),
      inboxSummary: emptyInboxSummary(),
    });
    expect(msg).toContain("[任务表] 空");
  });

  it("truncates the briefs line beyond 8 items", () => {
    const briefs = Array.from({ length: 10 }, (_, i) => ({
      id: `task-${i}`,
      nextRun: null,
    }));
    const msg = assembleTickMessage({
      now: new Date("2026-05-27T13:00:00"),
      phase: "work",
      activeBriefs: briefs,
      sessionsDigest: emptyDigest(),
    });
    expect(msg).toContain("10 项：");
    expect(msg).toContain("task-7");
    expect(msg).not.toContain("task-8（");
    expect(msg).toContain("…另有 2 项");
  });

  it("renders fallback line when there is no new observation", () => {
    const msg = assembleTickMessage({
      now: new Date("2026-05-27T13:00:00"),
      phase: "work",
      activeBriefs: [],
      sessionsDigest: emptyDigest(),
      inboxSummary: emptyInboxSummary(),
    });
    expect(msg).toContain("（自上个 tick 无新观测）");
  });

  it("appends the fixed reminder suffix on every tick message", () => {
    const withDelta = assembleTickMessage({
      now: new Date("2026-05-27T13:00:42"),
      phase: "work",
      activeBriefs: [],
      sessionsDigest: sampleDigest(),
    });
    const withoutDelta = assembleTickMessage({
      now: new Date("2026-05-27T13:05:00"),
      phase: "quiet",
      activeBriefs: [],
      sessionsDigest: emptyDigest(),
    });
    for (const msg of [withDelta, withoutDelta]) {
      expect(msg).toContain("提醒：观测增量不含持续数据源型 Skill");
      expect(msg).toContain("全部安静才允许直接 sleep");
      // 后缀在 </tick> 之前
      expect(msg.indexOf("提醒：")).toBeLessThan(msg.indexOf("</tick>"));
    }
  });

  it("embeds brief trigger content as 任务正文 section", () => {
    const msg = assembleTickMessage({
      now: new Date("2026-05-27T13:00:00"),
      phase: "work",
      activeBriefs: [{ id: "weekly-report", nextRun: null }],
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
      activeBriefs: [],
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
    expect(prompt).toContain("# 每次唤醒的例程");
    expect(prompt).toContain("# 闲时工作");
    expect(prompt).toContain("# Workspace boundary");
    expect(prompt).toContain("读和写的授权范围不同");
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
    expect(a).not.toContain("[任务表]");
    expect(a).not.toContain("# 观测摘要");
  });

  it("falls back to the default soul when soul.md is blank", () => {
    const prompt = assembleSystemPrompt({
      config: baseConfig(),                       // soulMd: ""
      shortTermResult: emptyShortTerm(),
    });
    expect(prompt).toContain("时机之神");
    expect(prompt).toContain("恰当的时机");
    // 塞巴斯设定已废弃，不允许回归
    expect(prompt).not.toContain("塞巴斯");
    expect(prompt).not.toContain("执事");
  });

  it("injects a custom soul.md into the {soul} slot, keeping mechanism sections intact", () => {
    const config = { ...baseConfig(), soulMd: "# 你是 Kairos —— 海盗腔的后台助手\n说话带点海风味。" };
    const prompt = assembleSystemPrompt({ config, shortTermResult: emptyShortTerm() });
    expect(prompt).toContain("海盗腔的后台助手");
    expect(prompt).not.toContain("时机之神");
    // 人格可换，机制段不可丢
    expect(prompt).toContain("# 产出契约");
    expect(prompt).toContain("# 每次唤醒的例程");
    expect(prompt).toContain("授权覆盖原则");
    expect(prompt.match(/\{\w+\}/g)).toBeNull();
  });

  it("renders the whitelist skill catalog into the system prompt", () => {
    const prompt = assembleSystemPrompt({
      config: baseConfig(),
      shortTermResult: emptyShortTerm(),
      skillCatalog: [
        {
          name: "fs-watch",
          description: "读取文件监听事件日志",
          location: "/data/skills/fs-watch/SKILL.md",
          directory: "/data/skills/fs-watch",
        },
      ],
    });
    expect(prompt).toContain("- fs-watch：读取文件监听事件日志");
    expect(prompt).toContain("SKILL.md：/data/skills/fs-watch/SKILL.md");
    expect(prompt.match(/\{\w+\}/g)).toBeNull();
  });
});

describe("renderKairosSkillCatalog", () => {
  it("renders placeholder when no skill is enabled", () => {
    expect(renderKairosSkillCatalog([])).toContain("无已启用 Skill");
  });

  it("renders name/description/location plus usage guidance per entry", () => {
    const text = renderKairosSkillCatalog([
      { name: "a", description: "da", location: "/s/a/SKILL.md", directory: "/s/a" },
      { name: "b", description: "db", location: "/s/b/SKILL.md", directory: "/s/b" },
    ]);
    expect(text).toContain("- a：da");
    expect(text).toContain("  SKILL.md：/s/a/SKILL.md");
    expect(text).toContain("- b：db");
    expect(text).toContain("先用 read_file 读它的 SKILL.md");
    expect(text).toContain("持续更新的数据源");
  });
});

import { describe, it, expect } from "vitest";
import {
  assembleSystemPrompt,
  buildHistorySummary,
  buildObservationSummary,
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

describe("buildObservationSummary", () => {
  it("renders both watch diff and sessions digest sections", () => {
    const watchDiffs: WatchDiffEntry[] = [
      {
        rootPath: "/tmp/work/docs",
        added: ["/tmp/work/docs/a.md", "/tmp/work/docs/b.md"],
        removed: [],
        truncated: false,
        totalAdded: 2,
        totalRemoved: 0,
      },
    ];
    const digest: SessionsDigestResult = {
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
          ],
        },
      ],
    };
    const text = buildObservationSummary({ watchDiffs, sessionsDigest: digest });
    expect(text).toContain("巡检目录变化");
    expect(text).toContain("/tmp/work/docs");
    expect(text).toContain("新增 2");
    expect(text).toContain("a.md");
    // 排序按 unread 降序：s1 在前
    const s1Idx = text.indexOf("session-s1");
    const s2Idx = text.indexOf("session-s2");
    expect(s1Idx).toBeGreaterThan(-1);
    expect(s2Idx).toBeGreaterThan(s1Idx);
  });

  it("handles empty inputs with friendly placeholders", () => {
    const text = buildObservationSummary({ watchDiffs: [], sessionsDigest: emptyDigest() });
    expect(text).toContain("（无配置 watch 路径或本次扫描无差异）");
    expect(text).toContain("（暂无可读 sessions 工作区）");
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
        { label: "week_05-20_to_05-26", text: "week summary body" },
        { label: "year_2025", text: "year summary body" },
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
  it("substitutes all placeholders and is under ~6300 token budget", () => {
    const prompt = assembleSystemPrompt({
      config: baseConfig(),
      watchDiffs: [],
      sessionsDigest: emptyDigest(),
      shortTermResult: emptyShortTerm(),
      now: new Date("2026-05-27T13:00:00"),
      activeBriefsCount: 2,
    });
    expect(prompt).toContain("You are Kairos");
    expect(prompt).toContain("[活跃 briefs] 2 个");
    expect(prompt).toContain("配置提示");
    expect(prompt).toContain("# Workspace boundary");
    expect(prompt).toContain("不要默认读写 actspace app 仓库");
    expect(prompt).toContain("# 用户规则");
    expect(prompt).toContain("请保持简洁。");
    expect(prompt).toContain("# 观测摘要");
    expect(prompt).toContain("# 历史摘要");
    // 不残留任何未替换占位符
    expect(prompt.match(/\{\w+\}/g)).toBeNull();
    // 总长上限：6300 token ≈ 18900 chars
    expect(prompt.length).toBeLessThan(18900);
  });

  it("derives phase label from time of day", () => {
    const work = assembleSystemPrompt({
      config: baseConfig(),
      watchDiffs: [],
      sessionsDigest: emptyDigest(),
      shortTermResult: emptyShortTerm(),
      now: new Date("2026-05-27T13:00:00"),
      activeBriefsCount: 0,
    });
    expect(work).toContain("（work）");

    const sat = assembleSystemPrompt({
      config: baseConfig(),
      watchDiffs: [],
      sessionsDigest: emptyDigest(),
      shortTermResult: emptyShortTerm(),
      now: new Date("2026-05-30T13:00:00"),
      activeBriefsCount: 0,
    });
    expect(sat).toContain("（weekend）");
  });
});

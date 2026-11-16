import { describe, expect, it } from "vitest";
import { buildReleaseActivity } from "../activity";
import { parseReleaseNotes } from "../parse-release-notes";

const entries = parseReleaseNotes(`
## 2026-06

### 2026-06-28 — 较早更新

#### 改进

- 较早记录。

## 2026-07

### 2026-07-01 — 跨月更新

#### 新功能

- 新功能一。
- 新功能二。

#### 问题修复

- 修复一。
`, "docs/releases/feature-release-notes.md");

describe("buildReleaseActivity", () => {
  it("lists every day from the first to the latest release, with per-type counts", () => {
    const activity = buildReleaseActivity(entries)!;
    expect(activity.days.map((day) => day.date)).toEqual(["2026-06-28", "2026-06-29", "2026-06-30", "2026-07-01"]);
    expect(activity.days[0]).toMatchObject({ total: 1, counts: { feature: 0, improvement: 1, fix: 0 }, release: { anchor: "release-2026-06-28" } });
    expect(activity.days[1]).toMatchObject({ total: 0, release: undefined });
    expect(activity.days[3]).toMatchObject({ total: 3, counts: { feature: 2, improvement: 0, fix: 1 }, release: { title: "跨月更新" } });
    expect(activity.maxTotal).toBe(3);
    expect(activity.latestDate).toBe("2026-07-01");
  });

  it("counts active days in the 30 days ending at the latest release", () => {
    const old = parseReleaseNotes(`
## 2026-05

### 2026-05-01 — 很早

#### 改进

- 很早。

## 2026-06

### 2026-06-01 — 窗口起点

#### 改进

- 起点。

### 2026-06-30 — 最近

#### 改进

- 最近。
`, "docs/releases/feature-release-notes.md");
    expect(buildReleaseActivity(old)!.activeDaysLast30).toBe(2);
  });

  it("returns undefined without releases", () => {
    expect(buildReleaseActivity([])).toBeUndefined();
  });
});

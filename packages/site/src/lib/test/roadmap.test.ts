import { describe, expect, it } from "vitest";
import { loadRoadmap, parseRoadmap, RoadmapParseError } from "../roadmap";

const source = "docs/roadmap.md";

describe("parseRoadmap", () => {
  it("loads the repository roadmap source", async () => {
    const result = await loadRoadmap();
    expect(result.some((item) => item.title === "Agent Room 协作空间")).toBe(true);
  });

  it("parses open and completed tasks in source order", () => {
    const result = parseRoadmap(`
# 开发计划

## 功能清单

- [ ] Agent Room
- [x] Browser Use — 完成于 2026-07-10
`, source);

    expect(result).toEqual([
      { title: "Agent Room", status: "open" },
      { title: "Browser Use", status: "completed", completedAt: "2026-07-10" },
    ]);
  });

  it("requires a completion date for checked tasks", () => {
    expect(() => parseRoadmap(`
## 功能清单

- [x] Browser Use
`, source)).toThrow("已完成项目必须使用");
  });

  it("rejects invalid completion dates", () => {
    expect(() => parseRoadmap(`
## 功能清单

- [x] Browser Use — 完成于 2026-02-31
`, source)).toThrow("不是合法日期");
  });

  it("rejects plain or nested list items", () => {
    expect(() => parseRoadmap(`
## 功能清单

- Browser Use
`, source)).toThrow(RoadmapParseError);

    expect(() => parseRoadmap(`
## 功能清单

- [ ] Browser Use
  - 子任务
`, source)).toThrow("单段、无嵌套");
  });

  it("rejects duplicate titles and missing feature lists", () => {
    expect(() => parseRoadmap(`
## 功能清单

- [ ] Browser Use
- [x] Browser Use — 完成于 2026-07-10
`, source)).toThrow("重复");

    expect(() => parseRoadmap("# 开发计划", source)).toThrow("缺少");
  });
});

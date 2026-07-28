import { describe, expect, it } from "vitest";
import { parseReleaseNotes, ReleaseParseError } from "../parse-release-notes";

const source = "docs/releases/feature-release-notes.md";

describe("parseReleaseNotes", () => {
  it("parses multiple months, preserves same-day order, and sorts newest first", () => {
    const result = parseReleaseNotes(`
## 2026-06

| 日期 | 功能域 | 用户价值 | 变更摘要 |
| --- | --- | --- | --- |
| 2026-06-30 | 旧功能 | 较早记录 | 旧摘要 |

## 2026-07

| 日期 | 功能域 | 用户价值 | 变更摘要 |
| --- | --- | --- | --- |
| 2026-07-27 | 第一条 | 用户价值一 | 摘要一 |
| 2026-07-27 | 第二条 | 用户价值二 | 摘要二 |
| 2026-07-26 | 第三条 | 用户价值三 | 摘要三 |
`, source);

    expect(result.map((entry) => entry.area)).toEqual(["第一条", "第二条", "第三条", "旧功能"]);
    expect(result.slice(0, 2).map((entry) => entry.anchor)).toEqual([
      "release-2026-07-27-1",
      "release-2026-07-27-2",
    ]);
  });

  it("preserves supported inline markdown and sanitizes dangerous URLs and raw HTML", () => {
    const [entry] = parseReleaseNotes(`
## 2026-07

| 日期 | 功能域 | 用户价值 | 变更摘要 |
| --- | --- | --- | --- |
| 2026-07-27 | Context | 支持 **强调**、\`代码\` 和 [文档](https://example.com) | <script>alert(1)</script> [危险](javascript:alert(1)) |
`, source);

    expect(entry?.userValueHtml).toContain("<strong>强调</strong>");
    expect(entry?.userValueHtml).toContain("<code>代码</code>");
    expect(entry?.userValueHtml).toContain('href="https://example.com"');
    expect(entry?.summaryHtml).not.toContain("<script>");
    expect(entry?.summaryHtml).not.toContain("javascript:");
  });

  it.each([
    {
      name: "invalid date",
      row: "| 2026-02-31 | Context | 用户价值 | 摘要 |",
      message: "不是合法的 YYYY-MM-DD",
    },
    {
      name: "month mismatch",
      row: "| 2026-06-27 | Context | 用户价值 | 摘要 |",
      message: "不属于标题月份",
    },
    {
      name: "missing required value",
      row: "| 2026-07-27 | Context |  | 摘要 |",
      message: "都不能为空",
    },
  ])("reports source and line for $name", ({ row, message }) => {
    expect(() => parseReleaseNotes(`
## 2026-07

| 日期 | 功能域 | 用户价值 | 变更摘要 |
| --- | --- | --- | --- |
${row}
`, source)).toThrow(new RegExp(`${source}.*第 6 行.*${message}`));
  });

  it("rejects a matching table row with the wrong column count", () => {
    expect(() => parseReleaseNotes(`
## 2026-07

| 日期 | 功能域 | 用户价值 | 变更摘要 |
| --- | --- | --- | --- |
| 2026-07-27 | Context | 用户价值 |
`, source)).toThrow(ReleaseParseError);
  });

  it("fails when no release table exists", () => {
    expect(() => parseReleaseNotes("## 2026-07\n\n没有表格", source)).toThrow("没有找到");
  });
});

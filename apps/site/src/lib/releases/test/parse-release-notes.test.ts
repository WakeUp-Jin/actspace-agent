import { describe, expect, it } from "vitest";
import { parseReleaseNotes, ReleaseParseError } from "../parse-release-notes";

const source = "docs/releases/feature-release-notes.md";

describe("parseReleaseNotes", () => {
  it("parses categorized releases, groups sections, and sorts newest first", () => {
    const result = parseReleaseNotes(`
## 2026-06

### 2026-06-30 — 较早更新

#### 改进

- 较早记录。

## 2026-07

### 2026-07-27 — 图片与任务体验

#### 新功能

- 支持图片附件。
- 支持任务复制。

#### 问题修复

- 修复空白面板。
`, source);

    expect(result.map((entry) => entry.title)).toEqual(["图片与任务体验", "较早更新"]);
    expect(result[0]?.anchor).toBe("release-2026-07-27");
    expect(result[0]?.sections.map((section) => section.type)).toEqual(["feature", "fix"]);
    expect(result[0]?.sections[0]?.itemsHtml).toEqual(["支持图片附件。", "支持任务复制。"]);
  });

  it("preserves supported inline markdown and sanitizes dangerous URLs and raw HTML", () => {
    const [entry] = parseReleaseNotes(`
## 2026-07

### 2026-07-27 — Context 更新

#### 新功能

- 支持 **强调**、\`代码\` 和 [文档](https://example.com)。
- 原始 HTML <script>alert(1)</script> [危险](javascript:alert(1))
`, source);

    const [safe, dangerous] = entry?.sections[0]?.itemsHtml ?? [];
    expect(safe).toContain("<strong>强调</strong>");
    expect(safe).toContain("<code>代码</code>");
    expect(safe).toContain('href="https://example.com"');
    expect(dangerous).not.toContain("<script>");
    expect(dangerous).not.toContain("javascript:");
  });

  it.each([
    {
      name: "invalid date",
      release: "### 2026-02-31 — Context",
      body: "#### 新功能\n\n- 更新。",
      message: "不是合法的 YYYY-MM-DD",
    },
    {
      name: "month mismatch",
      release: "### 2026-06-27 — Context",
      body: "#### 新功能\n\n- 更新。",
      message: "不属于标题月份",
    },
    {
      name: "invalid heading",
      release: "### 2026-07-27 Context",
      body: "#### 新功能\n\n- 更新。",
      message: "必须使用",
    },
    {
      name: "unknown category",
      release: "### 2026-07-27 — Context",
      body: "#### 其他\n\n- 更新。",
      message: "未知分类",
    },
    {
      name: "empty category",
      release: "### 2026-07-27 — Context",
      body: "#### 新功能",
      message: "至少需要一个列表项",
    },
  ])("reports source and line for $name", ({ release, body, message }) => {
    expect(() => parseReleaseNotes(`
## 2026-07

${release}

${body}
`, source)).toThrow(new RegExp(`${source}.*第 \\d+ 行.*${message}`));
  });

  it("rejects duplicate release dates", () => {
    expect(() => parseReleaseNotes(`
## 2026-07

### 2026-07-27 — 第一条

#### 新功能

- 更新一。

### 2026-07-27 — 第二条

#### 改进

- 更新二。
`, source)).toThrow("只能对应一次发布");
  });

  it("rejects nested list content", () => {
    expect(() => parseReleaseNotes(`
## 2026-07

### 2026-07-27 — Context

#### 新功能

- 一级
  - 二级
`, source)).toThrow(ReleaseParseError);
  });

  it("fails when no release entry exists", () => {
    expect(() => parseReleaseNotes("## 2026-07\n\n没有更新", source)).toThrow("没有找到");
  });
});

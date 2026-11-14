import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  collectHeadings,
  getOutline,
  findHeadingBySlug,
  sameOutline,
} from "../components/markdown-editor/core/outline";
import { githubSlug, uniqueSlugs } from "../components/markdown-editor/core/slug";
import { codeLanguageFor, frontmatterRange, markdownSyntax } from "../components/markdown-editor/core/syntax";

function parse(doc: string): EditorState {
  const state = EditorState.create({ doc, extensions: [markdownSyntax()] });
  ensureSyntaxTree(state, state.doc.length, 5000);
  return state;
}

/** 所有指定名字的节点文字 */
function texts(doc: string, name: string): string[] {
  const state = parse(doc);
  const out: string[] = [];
  ensureSyntaxTree(state, state.doc.length, 5000)!.iterate({
    enter(node) {
      if (node.name === name) out.push(state.sliceDoc(node.from, node.to));
    },
  });
  return out;
}

describe("数学扩展：行内公式 $…$", () => {
  it.each([
    ["质能 $E=mc^2$ 方程", ["$E=mc^2$"]],
    ["$a$ 和 $b$", ["$a$", "$b$"]],
    ["$x_1 + y_2$", ["$x_1 + y_2$"]],
    ["括号里 ($x$)", ["$x$"]],
  ])("识别 %s", (doc, expected) => {
    expect(texts(doc, "MathInline")).toEqual(expected);
  });

  const rejected: [string, string][] = [
    ["价格 $5 和 $10", "开头 $ 后面是数字且结尾 $ 后面紧跟数字"],
    ["价格 $5 和 $ 10", "结尾 $ 前面是空格"],
    ["$ 5 and 6$", "开头 $ 后面是空格"],
    ["花了 \\$5 买了 \\$6", "转义的 $ 不算"],
    ["未闭合 $x + y", "没有结尾"],
    ["跨行 $a\nb$", "不跨行"],
    ["只有 $$ 两个", "空公式"],
    ["`$a$`", "行内代码里不解析"],
  ];
  // 标题里有 `$`，不能走 it.each 的格式化
  for (const [doc, why] of rejected) {
    it(`不识别 ${JSON.stringify(doc)}（${why}）`, () => {
      expect(texts(doc, "MathInline")).toEqual([]);
    });
  }

  it("结尾 $ 后面紧跟数字不闭合：$a$1 不是公式", () => {
    expect(texts("$a$1", "MathInline")).toEqual([]);
  });

  it("$5 和 $10 之后的真公式仍然识别", () => {
    expect(texts("$5 和 $10，另有 $x$", "MathInline")).toEqual(["$x$"]);
  });
});

describe("数学扩展：块公式 $$", () => {
  it("独占一行的 $$ 开头和结尾", () => {
    expect(texts("$$\na^2 + b^2\n$$\n", "MathBlock")).toEqual(["$$\na^2 + b^2\n$$"]);
  });

  it("多行公式", () => {
    expect(
      texts("前文\n\n$$\n\\begin{aligned}\na &= b\\\\\nc &= d\n\\end{aligned}\n$$\n\n后文", "MathBlock"),
    ).toHaveLength(1);
  });

  it("没有结尾的 $$ 不是公式，不会吞掉后面的文档", () => {
    const doc = "$$\nx\n\n# 标题\n\n正文";
    expect(texts(doc, "MathBlock")).toEqual([]);
    expect(texts(doc, "ATXHeading1")).toEqual(["# 标题"]);
  });

  it("代码块里的 $$ 不是公式", () => {
    expect(texts("```\n$$\nx\n$$\n```", "MathBlock")).toEqual([]);
  });

  it("引用里的 $$ 不按块公式处理（块公式只在最外层）", () => {
    expect(texts("> $$\n> x\n> $$", "MathBlock")).toEqual([]);
  });

  it("同一行的 $$x$$ 不是块公式", () => {
    expect(texts("$$x$$", "MathBlock")).toEqual([]);
  });
});

describe("Frontmatter", () => {
  it("文档开头的 --- 到 --- 是 frontmatter", () => {
    const front = "---\ntitle: 标题\ntags: [a, b]\n---";
    const state = parse(`${front}\n\n# 正文\n`);
    expect(frontmatterRange(state)).toEqual({ from: 0, to: front.length });
  });

  it("不在文档开头不算", () => {
    expect(frontmatterRange(parse("\n---\na: 1\n---\n"))).toBeNull();
    expect(frontmatterRange(parse("文字\n\n---\na: 1\n---\n"))).toBeNull();
  });

  it("没有结尾的 --- 不算，后面照常解析", () => {
    const state = parse("---\na: 1\n\n# 标题\n");
    expect(frontmatterRange(state)).toBeNull();
    expect(texts("---\na: 1\n\n# 标题\n", "ATXHeading1")).toEqual(["# 标题"]);
  });

  it("空 frontmatter", () => {
    expect(frontmatterRange(parse("---\n---\n正文"))).not.toBeNull();
  });

  it("frontmatter 之后的分隔线仍是分隔线", () => {
    expect(texts("---\na: 1\n---\n\n文字\n\n---\n", "HorizontalRule")).toEqual(["---"]);
  });
});

describe("代码块语言", () => {
  it("按围栏语言名匹配语言包，认不出（含 mermaid）返回 null", () => {
    expect(codeLanguageFor("ts")?.name).toMatch(/typescript/i);
    expect(codeLanguageFor("python title=x")?.name).toMatch(/python/i);
    expect(codeLanguageFor("mermaid")).toBeNull();
    expect(codeLanguageFor("")).toBeNull();
  });
});

describe("GFM 与不启用的扩展", () => {
  it("表格、任务列表、删除线", () => {
    expect(texts("| a | b |\n| - | - |\n| 1 | 2 |", "Table")).toHaveLength(1);
    expect(texts("- [x] done", "TaskMarker")).toEqual(["[x]"]);
    expect(texts("~~gone~~", "Strikethrough")).toEqual(["~~gone~~"]);
  });

  it("不解析下标、上标、emoji", () => {
    expect(texts("H~2~O x^2^ :smile:", "Subscript")).toEqual([]);
    expect(texts("H~2~O x^2^ :smile:", "Superscript")).toEqual([]);
    expect(texts("H~2~O x^2^ :smile:", "Emoji")).toEqual([]);
  });
});

describe("大纲（outline）", () => {
  it("取 h2、h3，带行号和位置；h1、h4 不进大纲", () => {
    const doc = "# 一级\n\n## 安装\n\n### 步骤\n\n#### 细节\n\n## 使用\n";
    const outline = getOutline(parse(doc));
    expect(outline.map((item) => [item.level, item.text, item.line])).toEqual([
      [2, "安装", 3],
      [3, "步骤", 5],
      [2, "使用", 9],
    ]);
    expect(outline[0].from).toBe(doc.indexOf("## 安装"));
  });

  it("Setext 标题（=== 是 h1，--- 是 h2）", () => {
    const outline = getOutline(parse("标题甲\n======\n\n标题乙\n------\n\n正文\n"));
    expect(outline.map((item) => [item.level, item.text])).toEqual([[2, "标题乙"]]);
    expect(collectHeadings(parse("标题甲\n======\n\n标题乙\n------\n")).map((h) => h.level)).toEqual([1, 2]);
  });

  it("代码块、frontmatter、公式块、HTML 块里的 # 不算标题", () => {
    const doc = [
      "---",
      "# 注释",
      "---",
      "",
      "```md",
      "## 代码里",
      "```",
      "",
      "$$",
      "## 公式里",
      "$$",
      "",
      "<div>",
      "## html",
      "</div>",
      "",
      "## 真标题",
      "",
    ].join("\n");
    expect(getOutline(parse(doc)).map((item) => item.text)).toEqual(["真标题"]);
  });

  it("引用和列表里的标题也算", () => {
    const outline = getOutline(parse("> ## 引用里\n\n- ## 列表里\n"));
    expect(outline.map((item) => item.text)).toEqual(["引用里", "列表里"]);
  });

  it("去掉行内标记：粗体、链接、行内代码、结尾的 #", () => {
    const outline = getOutline(parse("## **粗** 与 [链接](a.md) 与 `code` ##\n"));
    expect(outline[0].text).toBe("粗 与 链接 与 code");
  });

  it("没有标题时是空数组", () => {
    expect(getOutline(parse("只是正文\n"))).toEqual([]);
  });

  it("sameOutline 比较位置和文字", () => {
    const a = getOutline(parse("## A\n"));
    expect(sameOutline(a, getOutline(parse("## A\n")))).toBe(true);
    expect(sameOutline(a, getOutline(parse("## B\n")))).toBe(false);
    expect(sameOutline(a, getOutline(parse("\n## A\n")))).toBe(false);
  });

  it("按 slug 找标题：同名标题带 -1 后缀，与 GitHub 一致", () => {
    const state = parse("## 安装\n\n## 安装\n\n## Hello World!\n");
    expect(findHeadingBySlug(state, "安装")?.line).toBe(1);
    expect(findHeadingBySlug(state, "安装-1")?.line).toBe(3);
    expect(findHeadingBySlug(state, "hello-world")?.line).toBe(5);
    expect(findHeadingBySlug(state, "不存在")).toBeNull();
  });
});

describe("GitHub 标题 slug", () => {
  it.each([
    ["Hello World", "hello-world"],
    ["Hello, World!", "hello-world"],
    ["安装与使用", "安装与使用"],
    ["API v2.0 (beta)", "api-v20-beta"],
    ["  前后空格  ", "前后空格"],
    ["a_b-c", "a_b-c"],
  ])("%s -> %s", (text, slug) => {
    expect(githubSlug(text)).toBe(slug);
  });

  it("重名依次加 -1、-2", () => {
    expect(uniqueSlugs(["A", "A", "A", "B"])).toEqual(["a", "a-1", "a-2", "b"]);
  });
});

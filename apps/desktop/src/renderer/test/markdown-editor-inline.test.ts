/** 规范 §5 逐元素：每个元素在“平时 / 露出 / 失焦”三种状态下的装饰。 */
import { describe, expect, it } from "vitest";
import { buildInlineDecorations } from "../components/markdown-editor/core/inline";
import {
  decos,
  hasClass,
  inlineDecos,
  isHidden,
  lineHas,
  makeState,
  widgetsIn,
  type Deco,
} from "./markdown-editor-helpers";

interface Scene {
  /** 光标在文档末尾（离开所有节点）、有焦点 */
  normal: Deco[];
  /** 光标在 `cursor`、有焦点 */
  revealed: Deco[];
  /** 光标在 `cursor`、没有焦点 */
  blurred: Deco[];
}

function scene(doc: string, cursor: number | [number, number]): Scene {
  return {
    normal: inlineDecos(makeState(doc, { cursor: doc.length })),
    revealed: inlineDecos(makeState(doc, { cursor })),
    blurred: inlineDecos(makeState(doc, { cursor, focused: false })),
  };
}

describe("标题", () => {
  const doc = "# 标题\n\n末尾";
  it("ATX：平时隐藏 `# `，光标进入露出，失焦收起；整行按级别排字号", () => {
    const s = scene(doc, 3);
    expect(isHidden(s.normal, 0, 2)).toBe(true);
    expect(isHidden(s.revealed, 0, 2)).toBe(false);
    expect(isHidden(s.blurred, 0, 2)).toBe(true);
    for (const list of [s.normal, s.revealed, s.blurred]) expect(lineHas(list, 0, "md-h1")).toBe(true);
  });

  it("h1–h6 对应 md-h1…md-h4（h4 以上同一档）", () => {
    const state = makeState("## a\n\n### b\n\n#### c\n\n###### d\n\n末尾", { cursor: 100, focused: false });
    const list = inlineDecos(state);
    expect(list.filter((d) => d.kind === "line").map((d) => d.cls)).toEqual([
      "md-h md-h2",
      "md-h md-h3",
      "md-h md-h4",
      "md-h md-h4",
    ]);
  });

  it("Setext：隐藏下划线那一行，光标进入露出", () => {
    const text = "标题\n===\n\n末尾";
    const s = scene(text, 1);
    expect(isHidden(s.normal, 3, 6)).toBe(true);
    expect(lineHas(s.normal, 3, "md-setext-mark")).toBe(true);
    expect(isHidden(s.revealed, 3, 6)).toBe(false);
    expect(isHidden(s.blurred, 3, 6)).toBe(true);
    expect(lineHas(s.normal, 0, "md-h1")).toBe(true);
  });
});

describe("粗体、斜体、删除线、行内代码（D1：只露出光标所在节点）", () => {
  it("粗体", () => {
    const text = "a **粗** b\n\n末尾";
    const s = scene(text, 5);
    expect([isHidden(s.normal, 2, 4), isHidden(s.normal, 5, 7)]).toEqual([true, true]);
    expect([isHidden(s.revealed, 2, 4), isHidden(s.revealed, 5, 7)]).toEqual([false, false]);
    expect([isHidden(s.blurred, 2, 4), isHidden(s.blurred, 5, 7)]).toEqual([true, true]);
  });

  it("同一行有两个粗体：光标在第一个里，只露出第一个的标记", () => {
    const text = "**甲** 和 **乙**\n\n末尾";
    const list = inlineDecos(makeState(text, { cursor: 3 }));
    expect(isHidden(list, 0, 2)).toBe(false);
    expect(isHidden(list, 3, 5)).toBe(false);
    expect(isHidden(list, 8, 10)).toBe(true);
    expect(isHidden(list, 11, 13)).toBe(true);
  });

  it("斜体、删除线", () => {
    const s = scene("*斜* ~~删~~\n\n末尾", 1);
    expect(isHidden(s.normal, 0, 1)).toBe(true);
    expect(isHidden(s.normal, 4, 6)).toBe(true);
    expect(isHidden(s.revealed, 0, 1)).toBe(false);
    expect(isHidden(s.revealed, 4, 6)).toBe(true);
    expect(isHidden(s.blurred, 0, 1)).toBe(true);
  });

  it("行内代码：灰底类名，反引号平时隐藏，光标进入露出", () => {
    const s = scene("`x = 1`\n\n末尾", 3);
    expect(hasClass(s.normal, "md-inline-code", "mark")).toBe(true);
    expect([isHidden(s.normal, 0, 1), isHidden(s.normal, 6, 7)]).toEqual([true, true]);
    expect(hasClass(s.revealed, "md-inline-code", "mark")).toBe(true);
    expect([isHidden(s.revealed, 0, 1), isHidden(s.revealed, 6, 7)]).toEqual([false, false]);
    expect(isHidden(s.blurred, 0, 1)).toBe(true);
  });
});

describe("行内代码里的路径（D12）", () => {
  const text = "看 `src/app.ts:42` 吧\n\n末尾";
  it("识别成路径：强调色类名 + 文件图标；反引号平时隐藏，露出时路径样式不变", () => {
    const s = scene(text, 8);
    expect(hasClass(s.normal, "md-path", "mark")).toBe(true);
    expect(widgetsIn(s.normal)).toContain("FileIconWidget");
    expect(isHidden(s.normal, 2, 3)).toBe(true);
    expect(hasClass(s.revealed, "md-path", "mark")).toBe(true);
    expect(isHidden(s.revealed, 2, 3)).toBe(false);
    expect(hasClass(s.blurred, "md-path", "mark")).toBe(true);
  });

  it("title 提示带行号", () => {
    const mark = inlineDecos(makeState(text, { cursor: text.length })).find((d) => d.cls === "md-path");
    expect(mark?.attrs?.title).toContain("src/app.ts:42");
  });

  it("版本号、a/b 短片段、带空格、URL 不识别成路径", () => {
    for (const code of ["1.2.3", "a/b", "foo bar.ts", "https://x.com/a.ts", "console.log"]) {
      const list = inlineDecos(makeState(`\`${code}\`\n\n末尾`, { cursor: 100 }));
      expect(hasClass(list, "md-path")).toBe(false);
      expect(hasClass(list, "md-inline-code", "mark")).toBe(true);
    }
  });

  it("越出工作区的路径不识别", () => {
    expect(hasClass(inlineDecos(makeState("`../../../x.ts`\n\n末尾", { cursor: 100 })), "md-path")).toBe(false);
  });
});

describe("链接", () => {
  it("本地文件链接：只显示文字，强调色 + 文件图标，露出时显示完整语法", () => {
    const text = "[文字](other.md)\n\n末尾";
    const s = scene(text, 2);
    expect(hasClass(s.normal, "md-link-file", "mark")).toBe(true);
    expect(widgetsIn(s.normal)).toContain("FileIconWidget");
    expect([isHidden(s.normal, 0, 1), isHidden(s.normal, 3, 14)]).toEqual([true, true]);
    expect([isHidden(s.revealed, 0, 1), isHidden(s.revealed, 3, 14)]).toEqual([false, false]);
    expect([isHidden(s.blurred, 0, 1), isHidden(s.blurred, 3, 14)]).toEqual([true, true]);
  });

  it("网页链接：链接色，没有文件图标", () => {
    const list = inlineDecos(makeState("[x](https://example.com)\n\n末尾", { cursor: 100 }));
    expect(hasClass(list, "md-link", "mark")).toBe(true);
    expect(hasClass(list, "md-link-file")).toBe(false);
    expect(widgetsIn(list)).not.toContain("FileIconWidget");
  });

  it("其他协议、越界：不加链接样式，标记仍隐藏", () => {
    for (const href of ["javascript:alert(1)", "file:///etc/passwd", "../../../x.md"]) {
      const text = `[文字](${href})\n\n末尾`;
      const list = inlineDecos(makeState(text, { cursor: 100 }));
      expect(hasClass(list, "md-link")).toBe(false);
      expect(hasClass(list, "md-link-dead", "mark")).toBe(true);
      expect(isHidden(list, 0, 1)).toBe(true);
    }
  });

  it("裸 URL 和 <自动链接> 是链接色；尖括号平时隐藏", () => {
    const bare = inlineDecos(makeState("见 https://example.com 吧\n\n末尾", { cursor: 100 }));
    expect(hasClass(bare, "md-link", "mark")).toBe(true);
    const text = "<https://example.com>\n\n末尾";
    const s = scene(text, 5);
    expect(hasClass(s.normal, "md-link", "mark")).toBe(true);
    expect([isHidden(s.normal, 0, 1), isHidden(s.normal, 20, 21)]).toEqual([true, true]);
    expect(isHidden(s.revealed, 0, 1)).toBe(false);
  });
});

describe("图片（D10）", () => {
  it("本地图片：平时用图片替换源码，光标进入显示源码、图片在下方", () => {
    const text = "![说明](img/a.png)\n\n末尾";
    const s = scene(text, 5);
    expect(s.normal.find((d) => d.widget === "ImageWidget")?.kind).toBe("widget");
    expect(s.normal.some((d) => d.widget === "ImageWidget" && d.from === 0 && d.to === 16)).toBe(true);
    const shown = s.revealed.find((d) => d.widget === "ImageWidget");
    expect(shown && shown.from === shown.to).toBe(true);
    expect(s.blurred.some((d) => d.widget === "ImageWidget" && d.to > d.from)).toBe(true);
  });

  it("远程图片：显示原文，不渲染，悬停提示", () => {
    const list = inlineDecos(makeState("![x](https://example.com/a.png)\n\n末尾", { cursor: 100 }));
    expect(widgetsIn(list)).not.toContain("ImageWidget");
    expect(list.find((d) => d.cls === "md-img-skipped")?.attrs?.title).toBe("远程图片不加载");
  });

  it("越界、其他协议的图片按普通文字显示", () => {
    for (const src of ["../../../a.png", "javascript:x", "data:image/png;base64,AAAA"]) {
      const list = inlineDecos(makeState(`![x](${src})\n\n末尾`, { cursor: 100 }));
      expect(widgetsIn(list)).not.toContain("ImageWidget");
    }
  });
});

describe("列表", () => {
  it("无序列表：三层依次是圆点 widget；光标碰到标记还原成 `-`", () => {
    const text = "- a\n  - b\n    - c\n\n末尾";
    const normal = inlineDecos(makeState(text, { cursor: text.length }));
    expect(widgetsIn(normal)).toEqual(["BulletWidget", "BulletWidget", "BulletWidget"]);
    expect(lineHas(normal, 0, "md-li")).toBe(true);
    expect(lineHas(normal, 0, "md-li-hang")).toBe(true);
    const revealed = inlineDecos(makeState(text, { cursor: 1 }));
    expect(widgetsIn(revealed)).toEqual(["BulletWidget", "BulletWidget"]);
    expect(hasClass(revealed, "md-list-mark", "mark")).toBe(true);
    expect(widgetsIn(inlineDecos(makeState(text, { cursor: 1, focused: false })))).toHaveLength(3);
  });

  it("有序列表：序号原文，淡色", () => {
    const list = inlineDecos(makeState("1. 甲\n2. 乙\n\n末尾", { cursor: 100 }));
    expect(list.filter((d) => d.cls === "md-list-mark")).toHaveLength(2);
    expect(widgetsIn(list)).toEqual([]);
  });

  it("任务列表：复选框 widget，`- ` 隐藏；光标进入露出 `- [ ]`；已完成的项划线", () => {
    const text = "- [ ] 待办\n- [x] 完成\n\n末尾";
    const normal = inlineDecos(makeState(text, { cursor: text.length }));
    expect(widgetsIn(normal)).toEqual(["CheckboxWidget", "CheckboxWidget"]);
    expect(isHidden(normal, 0, 2)).toBe(true);
    expect(hasClass(normal, "md-task-done", "mark")).toBe(true);
    const revealed = inlineDecos(makeState(text, { cursor: 4 }));
    expect(widgetsIn(revealed)).toEqual(["CheckboxWidget"]);
    expect(isHidden(revealed, 0, 2)).toBe(false);
    const blurred = inlineDecos(makeState(text, { cursor: 4, focused: false }));
    expect(widgetsIn(blurred)).toEqual(["CheckboxWidget", "CheckboxWidget"]);
  });
});

describe("引用与提示框", () => {
  it("引用：每行加竖条类名，`> ` 平时隐藏，光标所在行露出", () => {
    const text = "> 一\n> 二\n\n末尾";
    const normal = inlineDecos(makeState(text, { cursor: text.length }));
    expect(lineHas(normal, 0, "md-quote")).toBe(true);
    expect(lineHas(normal, 4, "md-quote")).toBe(true);
    expect([isHidden(normal, 0, 2), isHidden(normal, 4, 6)]).toEqual([true, true]);
    const revealed = inlineDecos(makeState(text, { cursor: 3 }));
    expect([isHidden(revealed, 0, 2), isHidden(revealed, 4, 6)]).toEqual([false, true]);
    expect(isHidden(inlineDecos(makeState(text, { cursor: 3, focused: false })), 0, 2)).toBe(true);
  });

  it("嵌套引用：竖条叠加（md-quote-d2）", () => {
    const list = inlineDecos(makeState("> 外\n> > 内\n\n末尾", { cursor: 100 }));
    expect(lineHas(list, 4, "md-quote-d2")).toBe(true);
    expect(lineHas(list, 0, "md-quote-d2")).toBe(false);
  });

  it.each([
    ["NOTE", "note", "var(--act-color-info)"],
    ["TIP", "tip", "var(--act-color-success)"],
    ["IMPORTANT", "important", "var(--act-color-text)"],
    ["WARNING", "warning", "var(--act-color-warning)"],
    ["CAUTION", "caution", "var(--act-color-danger)"],
  ])("提示框 [!%s]：语义色 + 标签 widget", (type, cls, color) => {
    const text = `> [!${type}]\n> 内容\n\n末尾`;
    const list = inlineDecos(makeState(text, { cursor: text.length }));
    expect(lineHas(list, 0, `md-callout-${cls}`)).toBe(true);
    expect(list.find((d) => d.kind === "line" && d.from === 0)?.attrs?.style).toContain(color);
    expect(widgetsIn(list)).toContain("CalloutLabelWidget");
  });

  it("提示框：光标碰到 `[!TYPE]` 时露出原文，失焦收起", () => {
    const text = "> [!NOTE]\n> 内容\n\n末尾";
    expect(widgetsIn(inlineDecos(makeState(text, { cursor: 5 })))).not.toContain("CalloutLabelWidget");
    expect(widgetsIn(inlineDecos(makeState(text, { cursor: 5, focused: false })))).toContain("CalloutLabelWidget");
  });

  it("首行还有别的文字，或类型不认识：不是提示框", () => {
    for (const first of ["> [!NOTE] 带文字", "> [!INFO]", "> 普通"]) {
      const list = inlineDecos(makeState(`${first}\n> 内容\n\n末尾`, { cursor: 100 }));
      expect(hasClass(list, "md-callout")).toBe(false);
      expect(widgetsIn(list)).not.toContain("CalloutLabelWidget");
    }
  });
});

describe("分隔线", () => {
  it("平时一条细线，光标在这一行还原成 `---`", () => {
    const text = "文字\n\n---\n\n末尾";
    const s = scene(text, 5);
    expect(lineHas(s.normal, 4, "md-hr")).toBe(true);
    expect(isHidden(s.normal, 4, 7)).toBe(true);
    expect(lineHas(s.revealed, 4, "md-hr")).toBe(false);
    expect(isHidden(s.blurred, 4, 7)).toBe(true);
  });
});

describe("表格（D4）", () => {
  const text = "| 名称 | 值 |\n| --- | --- |\n| a | b |\n\n末尾";
  it("平时：每行是 flex 行，竖线和分隔行隐藏，表头加类名", () => {
    const list = inlineDecos(makeState(text, { cursor: text.length }));
    expect(lineHas(list, 0, "md-th")).toBe(true);
    expect(lineHas(list, 0, "md-tr")).toBe(true);
    expect(lineHas(list, 11, "md-tsep")).toBe(true);
    expect(isHidden(list, 11, 24)).toBe(true);
    expect(list.filter((d) => d.cls === "md-td")).toHaveLength(4);
    expect(hasClass(list, "md-pipe")).toBe(false);
  });

  it("光标在单元格里：只显示这个单元格两侧的竖线", () => {
    const list = inlineDecos(makeState(text, { cursor: 4 }));
    expect(list.filter((d) => d.cls === "md-pipe").map((d) => d.from)).toEqual([0, 5]);
    expect(isHidden(list, 9, 10)).toBe(true);
  });

  it("光标在分隔行：露出原文", () => {
    const list = inlineDecos(makeState(text, { cursor: 15 }));
    expect(lineHas(list, 11, "md-tsep")).toBe(false);
  });

  it("失焦：回到平时", () => {
    const list = inlineDecos(makeState(text, { cursor: 4, focused: false }));
    expect(hasClass(list, "md-pipe")).toBe(false);
  });

  it("单元格原地编辑：改字后仍是同样的表格结构", () => {
    const state = makeState(text, { cursor: 4 });
    const edited = state.update({ changes: { from: 4, to: 4, insert: "新" } }).state;
    expect(edited.doc.line(1).text).toBe("| 名称新 | 值 |");
    const list = inlineDecos(edited);
    expect(list.filter((d) => d.cls === "md-td")).toHaveLength(4);
    expect(lineHas(list, 0, "md-th")).toBe(true);
  });

  it("单元格里的行内标记照常处理", () => {
    const doc = "| **粗** | `src/a.ts` |\n| --- | --- |\n| 1 | 2 |\n\n末尾";
    const list = inlineDecos(makeState(doc, { cursor: doc.length }));
    expect(isHidden(list, 2, 4)).toBe(true);
    expect(hasClass(list, "md-path", "mark")).toBe(true);
  });
});

describe("代码块（D5）", () => {
  const text = "```js\nlet a = 1\n```\n\n末尾";
  it("平时：围栏隐藏，首行是代码头 widget，每行是代码行", () => {
    const s = scene(text, 8);
    expect(widgetsIn(s.normal)).toEqual(["CodeHeaderWidget"]);
    expect([
      lineHas(s.normal, 0, "md-code-first"),
      lineHas(s.normal, 6, "md-code-line"),
      lineHas(s.normal, 16, "md-code-last"),
    ]).toEqual([true, true, true]);
    expect(isHidden(s.normal, 16, 19)).toBe(true);
    expect(widgetsIn(s.blurred)).toEqual(["CodeHeaderWidget"]);
  });

  it("光标进入：显示两行围栏，代码头收起", () => {
    const { revealed } = scene(text, 8);
    expect(widgetsIn(revealed)).toEqual([]);
    expect(lineHas(revealed, 0, "md-code-fence")).toBe(true);
    expect(lineHas(revealed, 16, "md-code-fence")).toBe(true);
    expect(lineHas(revealed, 6, "md-code-fence")).toBe(false);
    expect(isHidden(revealed, 16, 19)).toBe(false);
  });

  it("未闭合的代码块：按代码块显示，不隐藏，没有代码头", () => {
    const doc = "```js\nlet a\n\n末尾";
    const list = inlineDecos(makeState(doc, { cursor: doc.length }));
    expect(lineHas(list, 0, "md-code-open")).toBe(true);
    expect(widgetsIn(list)).toEqual([]);
    expect(list.some((d) => d.kind === "hide")).toBe(false);
  });

  it("引用里的代码块也画成代码块", () => {
    const doc = "> ```js\n> a\n> ```\n\n末尾";
    const list = inlineDecos(makeState(doc, { cursor: doc.length }));
    expect(list.filter((d) => d.kind === "line" && d.cls.includes("md-code-line"))).toHaveLength(3);
  });

  it("Mermaid 围栏：平时由块级 widget 接管（这里不画），光标进入后当普通代码显示源码", () => {
    const doc = "```mermaid\ngraph TD\nA-->B\n```\n\n末尾";
    expect(inlineDecos(makeState(doc, { cursor: doc.length })).filter((d) => d.kind === "line")).toEqual([]);
    expect(lineHas(inlineDecos(makeState(doc, { cursor: 14 })), 0, "md-code-line")).toBe(true);
  });
});

describe("公式、Frontmatter、HTML", () => {
  it("行内公式：平时 KaTeX widget，光标进入露出源码", () => {
    const text = "质能 $E=mc^2$ 方程\n\n末尾";
    const s = scene(text, 6);
    expect(widgetsIn(s.normal)).toEqual(["MathWidget"]);
    expect(widgetsIn(s.revealed)).toEqual([]);
    expect(widgetsIn(s.blurred)).toEqual(["MathWidget"]);
  });

  it("块公式：光标进入收起 widget，源码按等宽淡色显示（widget 本身在块级字段里）", () => {
    const doc = "$$\nx^2\n$$\n\n末尾";
    expect(inlineDecos(makeState(doc, { cursor: doc.length })).filter((d) => d.kind === "line")).toEqual([]);
    const revealed = inlineDecos(makeState(doc, { cursor: 4 }));
    expect([0, 3, 7].map((pos) => lineHas(revealed, pos, "md-math-src"))).toEqual([true, true, true]);
  });

  it("Frontmatter：光标进入时源码按淡色等宽显示", () => {
    const doc = "---\ntitle: a\n---\n\n正文";
    expect(inlineDecos(makeState(doc, { cursor: doc.length })).filter((d) => d.kind === "line")).toEqual([]);
    expect(lineHas(inlineDecos(makeState(doc, { cursor: 6 })), 4, "md-fm-raw")).toBe(true);
    expect(inlineDecos(makeState(doc, { cursor: 6, focused: false })).filter((d) => d.kind === "line")).toEqual([]);
  });

  it("原始 HTML：按原文显示（淡色等宽），不执行", () => {
    const list = inlineDecos(makeState("<div>\nhi\n</div>\n\n行内 <b>粗</b>\n\n末尾", { cursor: 100 }));
    expect(lineHas(list, 0, "md-html")).toBe(true);
    expect(hasClass(list, "md-html", "mark")).toBe(true);
    expect(widgetsIn(list)).toEqual([]);
  });
});

describe("选区与可见范围", () => {
  it("非空选区按重叠算：选区碰到粗体就露出", () => {
    const text = "甲 **乙** 丙\n\n末尾";
    expect(isHidden(inlineDecos(makeState(text, { cursor: [0, 4] })), 2, 4)).toBe(false);
    expect(isHidden(inlineDecos(makeState(text, { cursor: [0, 2] })), 2, 4)).toBe(true);
  });

  it("只算指定范围：范围外的行不产生装饰", () => {
    const state = makeState("# 一\n\n# 二\n\n# 三\n", { cursor: 100 });
    const { decorations } = buildInlineDecorations(state, 0, 3);
    expect(
      decos(decorations)
        .filter((d) => d.kind === "line")
        .map((d) => d.from),
    ).toEqual([0]);
  });

  it("被替换的范围登记为原子范围", () => {
    const state = makeState("# 标题\n\n- a\n\n末尾", { cursor: 100 });
    const { atomic } = buildInlineDecorations(state);
    expect(decos(atomic).map((d) => [d.from, d.to])).toEqual([
      [0, 2],
      [6, 7],
    ]);
  });
});

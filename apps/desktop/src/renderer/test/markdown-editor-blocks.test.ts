/** 块级装饰（StateField）：frontmatter 卡片、Mermaid、块公式；重算策略。 */
import { EditorSelection } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { blockDecorations, blockField, collectBlocks } from "../components/markdown-editor/core/blocks";
import { setFocusEffect } from "../components/markdown-editor/core/focus";
import { decos, makeState } from "./markdown-editor-helpers";

const mermaid = "```mermaid\ngraph TD\nA-->B\n```";
const math = "$$\nx^2\n$$";
const front = "---\ntitle: 标题\n---";

describe("collectBlocks：只扫最外层的块", () => {
  it("frontmatter、Mermaid、块公式", () => {
    const doc = `${front}\n\n${mermaid}\n\n${math}\n\n末尾`;
    const blocks = collectBlocks(makeState(doc));
    expect(blocks.map((b) => b.kind)).toEqual(["frontmatter", "mermaid", "math"]);
    const m = blocks[1];
    expect(m.kind === "mermaid" && m.code).toBe("graph TD\nA-->B");
    const x = blocks[2];
    expect(x.kind === "math" && x.tex).toBe("x^2");
  });

  it("未闭合的 Mermaid 围栏、引用和列表里的 Mermaid / 公式不算块 widget", () => {
    expect(collectBlocks(makeState("```mermaid\ngraph TD\n"))).toEqual([]);
    expect(collectBlocks(makeState("> ```mermaid\n> graph TD\n> ```\n"))).toEqual([]);
    expect(collectBlocks(makeState("- ```mermaid\n  graph TD\n  ```\n"))).toEqual([]);
    expect(collectBlocks(makeState("> $$\n> x\n> $$\n"))).toEqual([]);
  });

  it("普通代码块不算", () => {
    expect(collectBlocks(makeState("```js\nlet a\n```\n"))).toEqual([]);
  });

  it("范围是整行", () => {
    const doc = `文字\n\n${math}\n\n末尾`;
    const [block] = collectBlocks(makeState(doc));
    expect(doc.slice(block.from, block.to)).toBe(math);
  });
});

describe("块级装饰：平时 / 露出 / 失焦", () => {
  it("frontmatter：平时属性卡片，光标进入露出源码（卡片消失），失焦收起", () => {
    const doc = `${front}\n\n正文`;
    const normal = decos(blockDecorations(makeState(doc, { cursor: doc.length })));
    expect(normal.map((d) => [d.kind, d.widget, d.from, d.to])).toEqual([["block", "FrontmatterWidget", 0, front.length]]);
    expect(decos(blockDecorations(makeState(doc, { cursor: 6 })))).toEqual([]);
    expect(decos(blockDecorations(makeState(doc, { cursor: 6, focused: false }))).map((d) => d.widget)).toEqual(["FrontmatterWidget"]);
  });

  it("Mermaid：平时整块替换成图；光标进入后源码露出，图放在源码下方", () => {
    const doc = `${mermaid}\n\n末尾`;
    const normal = decos(blockDecorations(makeState(doc, { cursor: doc.length })));
    expect(normal.map((d) => [d.widget, d.from, d.to])).toEqual([["MermaidWidget", 0, mermaid.length]]);
    const revealed = decos(blockDecorations(makeState(doc, { cursor: 14 })));
    expect(revealed.map((d) => [d.kind, d.widget, d.from, d.to])).toEqual([["block", "MermaidWidget", mermaid.length, mermaid.length]]);
    expect(decos(blockDecorations(makeState(doc, { cursor: 14, focused: false }))).map((d) => d.from === 0 && d.to > 0)).toEqual([true]);
  });

  it("块公式：平时 KaTeX 块，光标进入露出源码", () => {
    const doc = `${math}\n\n末尾`;
    expect(decos(blockDecorations(makeState(doc, { cursor: doc.length }))).map((d) => d.widget)).toEqual(["MathWidget"]);
    expect(decos(blockDecorations(makeState(doc, { cursor: 4 })))).toEqual([]);
    expect(decos(blockDecorations(makeState(doc, { cursor: 4, focused: false }))).map((d) => d.widget)).toEqual(["MathWidget"]);
  });

  it("块级替换登记为原子范围", () => {
    const doc = `${math}\n\n末尾`;
    const state = makeState(doc, { cursor: doc.length });
    expect(decos(state.field(blockField).atomic).map((d) => [d.from, d.to])).toEqual([[0, math.length]]);
  });
});

describe("重算策略（规范 §11）", () => {
  const doc = `${math}\n\n文字一\n\n文字二\n\n${mermaid}\n\n末尾`;

  it("光标在块外移动：前后是同一个 DecorationSet", () => {
    const a = makeState(doc, { cursor: doc.indexOf("文字一") });
    const before = blockDecorations(a);
    const b = a.update({ selection: EditorSelection.cursor(doc.indexOf("文字二") + 1) }).state;
    expect(blockDecorations(b)).toBe(before);
    const c = b.update({ selection: EditorSelection.cursor(doc.length) }).state;
    expect(blockDecorations(c)).toBe(before);
  });

  it("失焦 / 聚焦、但没有块被碰到：同一个 DecorationSet", () => {
    const a = makeState(doc, { cursor: doc.indexOf("文字一") });
    const blurred = a.update({ effects: setFocusEffect.of(false) }).state;
    expect(blockDecorations(blurred)).toBe(blockDecorations(a));
  });

  it("光标进入块：重算，露出集合变了", () => {
    const a = makeState(doc, { cursor: doc.indexOf("文字一") });
    const b = a.update({ selection: EditorSelection.cursor(4) }).state;
    expect(blockDecorations(b)).not.toBe(blockDecorations(a));
    expect(decos(blockDecorations(b)).map((d) => d.widget)).toEqual(["MermaidWidget"]);
  });

  it("光标从一个块进到另一个块：重算", () => {
    const a = makeState(doc, { cursor: 4 });
    const b = a.update({ selection: EditorSelection.cursor(doc.indexOf("graph") + 1) }).state;
    expect(blockDecorations(b)).not.toBe(blockDecorations(a));
  });

  it("失焦会收起正在露出的块：重算", () => {
    const a = makeState(doc, { cursor: 4 });
    const b = a.update({ effects: setFocusEffect.of(false) }).state;
    expect(decos(blockDecorations(b)).map((d) => d.widget)).toEqual(["MathWidget", "MermaidWidget"]);
  });

  it("文档变了：重新扫描", () => {
    const a = makeState(doc, { cursor: doc.length });
    const insertAt = doc.indexOf("文字一");
    const b = a.update({ changes: { from: insertAt, insert: "$$\ny\n$$\n\n" } }).state;
    expect(decos(blockDecorations(b)).filter((d) => d.widget === "MathWidget")).toHaveLength(2);
  });

  it("输入法组字期间：只映射，不重算；组字结束后的下一次更新补算", () => {
    const text = "文字\n\n末尾";
    let state = makeState(text, { cursor: text.length });
    expect(decos(blockDecorations(state))).toEqual([]);
    // 组字中敲出一个公式块：不重算，装饰集合里还没有它
    state = state.update({ changes: { from: 2, insert: "\n\n$$\nx\n$$" }, userEvent: "input.type.compose" }).state;
    expect(decos(blockDecorations(state))).toEqual([]);
    // 组字结束后的下一次更新（任意 transaction）整体重算
    state = state.update({ changes: { from: state.doc.length, insert: " " }, userEvent: "input.type" }).state;
    expect(decos(blockDecorations(state)).map((d) => d.widget)).toEqual(["MathWidget"]);
  });
});

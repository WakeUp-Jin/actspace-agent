import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownProse } from "../components/messages/MarkdownProse";
import { ReplyStreamingContext } from "../components/messages/reply-streaming-context";
import type { HastNode } from "../components/messages/markdown/hast-types";
import { rehypeStreamTail, TAIL_LEVELS } from "../components/messages/markdown/rehype-stream-tail";
import { nextCut, snapCut, useSmoothText } from "../components/messages/markdown/smooth-text";

/** 流式效果：末尾渐显、光标、平滑输出（规范 §7，T19）。 */

const text = (value: string): HastNode => ({ type: "text", value });
const el = (tagName: string, children: HastNode[], className?: string[]): HastNode => ({ type: "element", tagName, properties: className ? { className } : {}, children });
const run = (tree: HastNode) => { rehypeStreamTail()(tree); return tree; };
const flat = (node: HastNode): string => (node.type === "text" ? node.value ?? "" : (node.children ?? []).map(flat).join(""));
const spansOf = (node: HastNode, level: number): HastNode[] => {
  const hits: HastNode[] = [];
  const walk = (n: HastNode) => {
    if (n.tagName === "span" && (n.properties?.className as string[] | undefined)?.includes(`md-tail-${level}`)) hits.push(n);
    n.children?.forEach(walk);
  };
  walk(node);
  return hits;
};
const carets = (node: HastNode): HastNode[] => {
  const hits: HastNode[] = [];
  const walk = (n: HastNode) => {
    if ((n.properties?.className as string[] | undefined)?.includes("md-caret")) hits.push(n);
    n.children?.forEach(walk);
  };
  walk(node);
  return hits;
};

describe("rehypeStreamTail", () => {
  it("光标放在结尾空白之前，不落在结尾换行后面", () => {
    const p = el("p", [text("你好世界  \n")]);
    run(el("root", [p]));
    const kinds = p.children!.map((child) => (child.type === "text" ? `text:${JSON.stringify(child.value)}` : (child.properties!.className as string[]).join(" ")));
    const caretAt = kinds.findIndex((kind) => kind === "md-caret");
    expect(caretAt).toBeGreaterThan(-1);
    expect(kinds[kinds.length - 1]).toBe('text:"  \\n"');
    expect(caretAt).toBe(kinds.length - 2);
    expect(flat(p)).toBe("你好世界  \n");
  });

  it("末尾有纯空白文本节点时，光标跟在最后一个可见字后面", () => {
    const li = el("li", [text("项目")]);
    const ul = el("ul", [text("\n"), li, text("\n")]);
    run(el("root", [ul]));
    expect(carets(li)).toHaveLength(1);
    expect(carets(ul)).toHaveLength(1);
    expect(ul.children![ul.children!.length - 1]).toEqual(text("\n"));
    expect(ul.children![0]).toEqual(text("\n"));
  });

  it("代码块里不放光标，文字原样保留", () => {
    const code = el("code", [text("const a = 1;\n")]);
    const tree = el("root", [el("pre", [code])]);
    run(tree);
    expect(carets(tree)).toHaveLength(0);
    expect(flat(tree)).toBe("const a = 1;\n");
  });

  it("公式内部不渐显、不放光标", () => {
    const math = el("span", [el("span", [text("x²")])], ["katex"]);
    const tree = el("root", [el("p", [text("前文"), math])]);
    run(tree);
    expect(flat(math)).toBe("x²");
    expect(spansOf(math, 1)).toHaveLength(0);
    expect(carets(math)).toHaveLength(0);
    // 最后一段可见文字是“前文”，光标跟在它后面。
    expect(carets(tree)).toHaveLength(1);
  });

  it("标了批注排除的节点内部也不参与", () => {
    const excluded: HastNode = { type: "element", tagName: "span", properties: { dataAnnotationExclude: "" }, children: [text("隐藏")] };
    const tree = el("root", [el("p", [text("可见"), excluded])]);
    run(tree);
    expect(spansOf(excluded, 1)).toHaveLength(0);
  });

  it("渐显的层数和字数：末尾 10 / 12 / 14 个字，更前面的不处理", () => {
    const value = "甲".repeat(20) + "乙".repeat(14) + "丙".repeat(12) + "丁".repeat(10);
    const p = el("p", [text(value)]);
    run(el("root", [p]));
    const [one, two, three] = [1, 2, 3].map((level) => spansOf(p, level).map(flat).join(""));
    expect(TAIL_LEVELS).toEqual([10, 22, 36]);
    expect(one).toBe("丁".repeat(10));
    expect(two).toBe("丙".repeat(12));
    expect(three).toBe("乙".repeat(14));
    expect(spansOf(p, 4)).toHaveLength(0);
    expect(flat(p)).toBe(value);
  });

  it("层数可以跨文本节点累计", () => {
    const p = el("p", [text("一二三四五"), el("strong", [text("六七八九十十一")])]);
    run(el("root", [p]));
    expect(spansOf(p, 1).map(flat).join("")).toBe("三四五六七八九十十一".slice(-10));
    expect(flat(p)).toBe("一二三四五六七八九十十一");
  });
});

describe("snapCut", () => {
  it("没有半截语法时不动", () => {
    expect(snapCut("普通文字继续写", 4)).toBe(4);
  });

  it("没闭合的反引号：后文到达了就挪到闭合处，没到达就不动", () => {
    const full = "看 `abc def` 之后";
    expect(snapCut(full, full.indexOf("abc") + 1)).toBe(full.indexOf("`", 3) + 1);
    expect(snapCut("看 `abc", 4)).toBe(4);
  });

  it("没闭合的 ** 粗体", () => {
    const full = "这是 **很重要** 的";
    const cut = full.indexOf("很") + 1;
    expect(snapCut(full, cut)).toBe(full.lastIndexOf("**") + 2);
    expect(snapCut("这是 **很", cut)).toBe(cut);
  });

  it("写了一半的链接：挪到 ) 之后；后文没到就不动", () => {
    const full = "详见 [文档](https://example.com/a) 了解";
    expect(snapCut(full, full.indexOf("文档") + 1)).toBe(full.indexOf(")") + 1);
    expect(snapCut(full, full.indexOf("https") + 3)).toBe(full.indexOf(")") + 1);
    expect(snapCut("详见 [文档](https://exa", "详见 [文档](https://exa".length)).toBe("详见 [文档](https://exa".length);
  });

  it("已经写完的链接和代码不受影响", () => {
    const full = "[a](b) `c` **d** 尾";
    expect(snapCut(full, full.length - 1)).toBe(full.length - 1);
  });

  it("表格行：整行一起出现（后文到了才挪）", () => {
    const full = "| a | b |\n|---|---|\n| 1 | 2 |\n后面";
    expect(snapCut(full, 4)).toBe(full.indexOf("\n") + 1);
    expect(snapCut("| a | b", 4)).toBe(4);
  });

  it("代码围栏开头行：整行一起出现", () => {
    const full = "前文\n```ts\nconst a = 1;\n```\n";
    const cut = full.indexOf("```") + 3;
    expect(snapCut(full, cut)).toBe(full.indexOf("\n", cut) + 1);
  });

  it("收尾围栏还没写完：退回行首等整行到达，流式结束后不再等（代码块不回缩）", () => {
    const partial = "```ts\nconst a = 1;\n``";
    const lineStart = partial.lastIndexOf("\n") + 1;
    expect(snapCut(partial, partial.length)).toBe(lineStart);
    expect(snapCut(partial, lineStart + 1)).toBe(lineStart);
    expect(snapCut("```ts\nconst a = 1;\n`", partial.length - 1)).toBe(lineStart);
    expect(snapCut(partial, partial.length, true)).toBe(partial.length);
    const closed = "```ts\nconst a = 1;\n```\n后文";
    expect(snapCut(closed, lineStart + 1)).toBe(closed.indexOf("后"));
  });

  it("围栏开头行还没写完：整行先不放出", () => {
    const partial = "前文\n```type";
    expect(snapCut(partial, partial.length)).toBe(partial.indexOf("`"));
    expect(snapCut(partial, partial.length, true)).toBe(partial.length);
  });

  it("行首的单个反引号后面跟着文字是行内代码，不按围栏处理", () => {
    expect(snapCut("`foo", 4)).toBe(4);
  });

  it("nextCut 在等没写完的围栏时不前进", () => {
    const partial = "```ts\nconst a = 1;\n``";
    const lineStart = partial.lastIndexOf("\n") + 1;
    expect(nextCut(partial, lineStart)).toBe(lineStart);
    expect(nextCut(partial, lineStart - 3)).toBe(lineStart - 2);
    expect(nextCut(partial, lineStart, true)).toBe(partial.length);
  });

  it("nextCut 每帧至少放 1 个字，积压越多放得越快，不超过全文", () => {
    const target = "a".repeat(120);
    expect(nextCut(target, 0)).toBe(10);
    expect(nextCut("abc", 2)).toBe(3);
    expect(nextCut(target, 119)).toBe(120);
    expect(nextCut(target, 120)).toBe(120);
  });
});

describe("useSmoothText", () => {
  let frames: Array<() => void>;
  beforeEach(() => {
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { frames.push(callback); return frames.length; });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  const tick = () => act(() => { const batch = frames; frames = []; batch.forEach((callback) => callback()); });
  const settle = () => { for (let i = 0; i < 200 && frames.length > 0; i += 1) tick(); };

  it("首次挂载已有的内容整段直接显示", () => {
    const { result } = renderHook(() => useSmoothText("已经有的一大段内容", true));
    expect(result.current).toEqual({ text: "已经有的一大段内容", backlog: false });
  });

  it("流式中追加的内容按帧放出，放完后没有积压", () => {
    const { result, rerender } = renderHook(({ target }) => useSmoothText(target, true), { initialProps: { target: "开头" } });
    const next = "开头" + "追加".repeat(30);
    rerender({ target: next });
    expect(result.current.text).toBe("开头");
    expect(result.current.backlog).toBe(true);
    tick();
    expect(result.current.text.length).toBeGreaterThan("开头".length);
    expect(result.current.text.length).toBeLessThan(next.length);
    expect(next.startsWith(result.current.text)).toBe(true);
    settle();
    expect(result.current).toEqual({ text: next, backlog: false });
  });

  it("每帧放出的字数 = ceil(积压/12)", () => {
    const { result, rerender } = renderHook(({ target }) => useSmoothText(target, true), { initialProps: { target: "" } });
    rerender({ target: "x".repeat(120) });
    tick();
    expect(result.current.text.length).toBe(10);
    tick();
    expect(result.current.text.length).toBe(10 + Math.ceil(110 / 12));
  });

  it("流式结束后，剩下的积压继续放完", () => {
    const { result, rerender } = renderHook(({ target, streaming }) => useSmoothText(target, streaming), { initialProps: { target: "a", streaming: true } });
    const next = "a" + "b".repeat(60);
    rerender({ target: next, streaming: true });
    tick();
    rerender({ target: next, streaming: false });
    expect(result.current.backlog).toBe(true);
    settle();
    expect(result.current).toEqual({ text: next, backlog: false });
  });

  it("收尾围栏没写完时停在行首，下一批到达或流式结束后再放", () => {
    const head = "```ts\nconst a = 1;\n";
    const { result, rerender } = renderHook(({ target, streaming }) => useSmoothText(target, streaming), { initialProps: { target: "", streaming: true } });
    rerender({ target: `${head}\`\``, streaming: true });
    settle();
    expect(result.current).toEqual({ text: head, backlog: true });
    expect(frames).toHaveLength(0);
    rerender({ target: `${head}\`\`\`\n结尾`, streaming: true });
    settle();
    expect(result.current).toEqual({ text: `${head}\`\`\`\n结尾`, backlog: false });

    rerender({ target: `${head}\`\`\`\n结尾\n\`\`\`py\nx\n\`\``, streaming: true });
    settle();
    expect(result.current.text).toBe(`${head}\`\`\`\n结尾\n\`\`\`py\nx\n`);
    rerender({ target: `${head}\`\`\`\n结尾\n\`\`\`py\nx\n\`\``, streaming: false });
    settle();
    expect(result.current.backlog).toBe(false);
  });

  it("内容变短（重新生成）时直接显示全部", () => {
    const { result, rerender } = renderHook(({ target }) => useSmoothText(target, true), { initialProps: { target: "很长很长的旧回复" } });
    rerender({ target: "新" });
    expect(result.current).toEqual({ text: "新", backlog: false });
  });

  it("不是在末尾追加（被改写）时直接显示全部", () => {
    const { result, rerender } = renderHook(({ target }) => useSmoothText(target, true), { initialProps: { target: "旧回复内容" } });
    rerender({ target: "完全不同的另一条回复，比较长一些" });
    expect(result.current.backlog).toBe(false);
    expect(result.current.text).toBe("完全不同的另一条回复，比较长一些");
  });

  it("不在流式中时，追加的内容直接显示全部", () => {
    const { result, rerender } = renderHook(({ target }) => useSmoothText(target, false), { initialProps: { target: "a" } });
    rerender({ target: "a" + "b".repeat(50) });
    expect(result.current.backlog).toBe(false);
    expect(result.current.text).toHaveLength(51);
  });
});

describe("MarkdownProse 流式效果", () => {
  let frames: Array<() => void>;
  beforeEach(() => {
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { frames.push(callback); return frames.length; });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });
  afterEach(() => vi.unstubAllGlobals());
  const tick = () => act(() => { const batch = frames; frames = []; batch.forEach((callback) => callback()); });

  function stream(content: string, streaming: boolean) {
    return (
      <ReplyStreamingContext.Provider value={streaming}>
        <MarkdownProse content={content} />
      </ReplyStreamingContext.Provider>
    );
  }

  it("流式中只有最后一块有渐显和光标；前面的块没有", () => {
    const { container } = render(stream("第一段文字\n\n第二段文字", true));
    const [first, second] = Array.from(container.querySelectorAll("p"));
    expect(first.querySelector(".md-tail, .md-caret")).toBeNull();
    expect(second.querySelector(".md-tail")).not.toBeNull();
    expect(second.querySelectorAll(".md-caret")).toHaveLength(1);
    expect(container.querySelector(".markdown-prose")).toHaveAttribute("data-streaming", "true");
  });

  it("光标是空元素，不改变可见文字", () => {
    const { container } = render(stream("一些文字", true));
    expect(container.querySelector(".md-caret")?.textContent).toBe("");
    expect(container.textContent).toBe("一些文字");
  });

  it("流式结束且积压放完后，渐显和光标都消失", () => {
    const view = render(stream("开头", true));
    view.rerender(stream("开头" + "继续".repeat(30), true));
    expect(view.container.querySelector(".md-caret")).not.toBeNull();
    view.rerender(stream("开头" + "继续".repeat(30), false));
    // 积压还没放完：仍按流式显示。
    expect(view.container.querySelector(".md-caret")).not.toBeNull();
    for (let i = 0; i < 100 && frames.length > 0; i += 1) tick();
    expect(view.container.querySelector(".md-caret, .md-tail")).toBeNull();
    expect(view.container.querySelector(".markdown-prose")).not.toHaveAttribute("data-streaming");
    expect(view.container.textContent).toBe("开头" + "继续".repeat(30));
  });

  it("内容变短时直接显示全部", () => {
    const view = render(stream("很长很长很长的旧回复内容", true));
    view.rerender(stream("新", true));
    expect(view.container.textContent).toBe("新");
  });

  it("非流式的历史回复没有渐显和光标", () => {
    const { container } = render(stream("历史回复内容", false));
    expect(container.querySelector(".md-tail, .md-caret")).toBeNull();
  });

  it("流式写出的代码块没有光标，围栏未闭合时显示「写入中 · N 行」且不显示按钮", () => {
    const { container } = render(stream("```ts\nconst a = 1;\nconst b = 2;\n", true));
    expect(container.querySelector(".md-caret")).toBeNull();
    expect(container.querySelector(".md-code-live")?.textContent).toBe("写入中 · 2 行");
    expect(container.querySelector(".md-code-btn")).toBeNull();
  });
});

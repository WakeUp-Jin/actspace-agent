import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownProse } from "../components/messages/MarkdownProse";
import { ReplyStreamingContext } from "../components/messages/reply-streaming-context";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { BLOCK_COMPONENTS } from "../components/messages/markdown/components-map";
import { BlockStateContext } from "../components/messages/markdown/contexts";
import type { HastNode } from "../components/messages/markdown/hast-types";
import {
  rehypeStreamTail,
  TAIL_LEVELS,
  type StreamTailOptions,
} from "../components/messages/markdown/rehype-stream-tail";
import { NO_TAIL, StreamTailContext, type StreamTail } from "../components/messages/markdown/StreamTail";
import { nextCut, snapCut, useSmoothText } from "../components/messages/markdown/smooth-text";

/** 流式效果：末尾渐显、光标、平滑输出（规范 §7，T19）。 */

const text = (value: string): HastNode => ({ type: "text", value });
const el = (tagName: string, children: HastNode[], className?: string[]): HastNode => ({
  type: "element",
  tagName,
  properties: className ? { className } : {},
  children,
});

/** 插件只放占位元素，渐显和光标由组件按尾巴生成：跑插件，再用和聊天区一样的组件映射渲染成 DOM。 */
function renderTail(
  children: HastNode[],
  tail: StreamTail = NO_TAIL,
  options?: StreamTailOptions,
  source = "",
): HTMLElement {
  const tree = el("root", children);
  tree.type = "root";
  rehypeStreamTail(options)(tree);
  const output = toJsxRuntime(tree as never, {
    Fragment,
    jsx,
    jsxs,
    components: BLOCK_COMPONENTS as never,
    passNode: true,
  });
  const { container } = render(
    <BlockStateContext.Provider value={{ source, fenceOpen: false }}>
      <StreamTailContext.Provider value={tail}>{output}</StreamTailContext.Provider>
    </BlockStateContext.Provider>,
  );
  return container;
}
const levelText = (root: Element, level: number) =>
  Array.from(root.querySelectorAll(`.md-tail-${level}`))
    .map((node) => node.textContent)
    .join("");

describe("rehypeStreamTail + 尾巴组件", () => {
  it("光标放在结尾空白之前，不落在结尾换行后面", () => {
    const root = renderTail([el("p", [text("你好世界  \n")])]);
    const p = root.querySelector("p")!;
    expect(p.textContent).toBe("你好世界  \n");
    const caret = p.querySelector(".md-caret")!;
    expect(caret).not.toBeNull();
    // 光标后面只剩结尾空白。
    expect(caret.parentElement!.nextSibling?.textContent).toBe("  \n");
  });

  it("末尾有纯空白文本节点时，光标跟在最后一个可见字后面", () => {
    const root = renderTail([el("ul", [text("\n"), el("li", [text("项目")]), text("\n")])]);
    const li = root.querySelector("li")!;
    expect(li.querySelectorAll(".md-caret")).toHaveLength(1);
    expect(root.querySelectorAll(".md-caret")).toHaveLength(1);
    expect(root.querySelector("ul")!.lastChild?.textContent).toBe("\n");
  });

  it("代码块里不放光标，文字原样保留", () => {
    const root = renderTail([el("pre", [el("code", [text("const a = 1;\n")])])]);
    expect(root.querySelector(".md-caret")).toBeNull();
    expect(root.querySelector("code")!.textContent).toBe("const a = 1;\n");
  });

  it("公式内部不渐显、不放光标", () => {
    const root = renderTail([el("p", [text("前文"), el("span", [el("span", [text("x²")])], ["katex"])])]);
    const math = root.querySelector(".katex")!;
    expect(math.textContent).toBe("x²");
    expect(math.querySelector(".md-tail, .md-caret")).toBeNull();
    expect(root.querySelectorAll(".md-caret")).toHaveLength(1);
    expect(levelText(root, 1)).toBe("前文");
  });

  it("标了批注排除的节点内部也不参与", () => {
    const excluded: HastNode = {
      type: "element",
      tagName: "span",
      properties: { dataAnnotationExclude: "" },
      children: [text("隐藏")],
    };
    const root = renderTail([el("p", [text("可见"), excluded])]);
    expect(root.querySelector("[data-annotation-exclude]")!.querySelector(".md-tail")).toBeNull();
  });

  it("渐显的层数和字数：末尾 10 / 12 / 14 个字，更前面的不处理", () => {
    const value = "甲".repeat(20) + "乙".repeat(14) + "丙".repeat(12) + "丁".repeat(10);
    const root = renderTail([el("p", [text(value)])]);
    expect(TAIL_LEVELS).toEqual([10, 22, 36]);
    expect(levelText(root, 1)).toBe("丁".repeat(10));
    expect(levelText(root, 2)).toBe("丙".repeat(12));
    expect(levelText(root, 3)).toBe("乙".repeat(14));
    expect(root.querySelector(".md-tail-4")).toBeNull();
    expect(root.querySelector("p")!.textContent).toBe(value);
  });

  it("层数可以跨文本节点累计", () => {
    const root = renderTail([el("p", [text("一二三四五"), el("strong", [text("六七八九十十一")])])]);
    expect(levelText(root, 1)).toBe("三四五六七八九十十一".slice(-10));
    expect(root.querySelector("p")!.textContent).toBe("一二三四五六七八九十十一");
    // 光标在加粗外面。
    expect(root.querySelector("strong .md-caret")).toBeNull();
  });

  it("有尾巴时：尾巴接在最后一个字后面、带渐显，已解析部分只承担剩下的渐显字数，光标在尾巴后面", () => {
    const root = renderTail([el("p", [text("甲".repeat(30))])], { text: "乙".repeat(12), lead: "" });
    const p = root.querySelector("p")!;
    expect(p.textContent).toBe("甲".repeat(30) + "乙".repeat(12));
    const raw = p.querySelector(".md-tail-raw")!;
    expect(raw.textContent).toBe("乙".repeat(12));
    expect(levelText(raw, 1)).toBe("乙".repeat(10));
    expect(levelText(raw, 2)).toBe("乙".repeat(2));
    // 已解析部分从第 13 个字开始：md-tail-2 还剩 10 个、md-tail-3 14 个。
    expect(levelText(p, 2)).toBe("甲".repeat(10) + "乙".repeat(2));
    expect(levelText(p, 3)).toBe("甲".repeat(14));
    expect(raw.lastElementChild).toHaveClass("md-caret");
  });

  it("尾巴超过 36 个字时已解析部分不再渐显；结尾空白放在光标后面；段末被吃掉的空格补回", () => {
    const root = renderTail([el("p", [text("已解析")])], { text: "新".repeat(40) + " ", lead: " " });
    const p = root.querySelector("p")!;
    expect(p.textContent).toBe("已解析 " + "新".repeat(40) + " ");
    expect(p.querySelector("act-fade, .md-tail-raw ~ .md-tail")).toBeNull();
    expect(p.firstChild?.textContent).toBe("已解析");
    expect(p.querySelector(".md-caret")!.nextSibling?.textContent).toBe(" ");
  });

  it("尾巴不进加粗、链接：接在行内元素后面", () => {
    const root = renderTail([el("p", [text("看 "), el("strong", [text("重点")])])], { text: "后文", lead: "" });
    expect(root.querySelector("strong")!.textContent).toBe("重点");
    expect(root.querySelector("p > .md-tail-raw")!.textContent).toBe("后文");
  });

  it("没闭合的代码块：尾巴接在代码最后一行的行尾，不高亮、不放光标；源码以换行结尾时另起一行", () => {
    const code = () => [
      el("pre", [el("code", [el("span", [text("const")], ["hljs-keyword"]), text(" a = 1;\n")], ["language-ts"])]),
    ];
    const sameLine = renderTail(code(), { text: "0", lead: "" }, undefined, "```ts\nconst a = 1;");
    expect(sameLine.querySelector("code")!.textContent).toBe("const a = 1;0\n");
    expect(sameLine.querySelector(".md-caret")).toBeNull();
    const nextLine = renderTail(code(), { text: "le", lead: "" }, undefined, "```ts\nconst a = 1;\n");
    expect(nextLine.querySelector("code")!.textContent).toBe("const a = 1;\nle\n");
    expect(nextLine.querySelector(".md-tail-raw")!.parentElement!.tagName).toBe("CODE");
    // 尾巴以换行结尾时不多出空行：和下一次解析的结果（代码末尾只有一个换行）行数相同，代码块不回缩。
    const endsWithBreak = renderTail(code(), { text: "le\nx = 2;\n", lead: "" }, undefined, "```ts\nconst a = 1;\n");
    expect(endsWithBreak.querySelector("code")!.textContent).toBe("const a = 1;\nle\nx = 2;\n");
  });

  it("隐藏的脚注区不接尾巴、不渐显：落在它前面的正文上", () => {
    const section: HastNode = {
      type: "element",
      tagName: "section",
      properties: { dataFootnotes: true },
      children: [el("ol", [el("li", [el("p", [text("注释")])])])],
    };
    const root = renderTail(
      [el("p", [text("正文")]), text("\n"), section],
      { text: "续", lead: "" },
      { skipFootnoteSection: true },
    );
    expect(root.querySelector("section")).toBeNull();
    expect(root.querySelector("p")!.textContent).toBe("正文续");
  });

  it("块里没有可接的容器（最后是分隔线）时，尾巴和光标都不显示", () => {
    const root = renderTail([el("hr", [])], { text: "x", lead: "" });
    expect(root.querySelector(".md-tail-raw, .md-caret")).toBeNull();
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
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  const tick = () =>
    act(() => {
      const batch = frames;
      frames = [];
      batch.forEach((callback) => {
        callback();
      });
    });
  const settle = () => {
    for (let i = 0; i < 200 && frames.length > 0; i += 1) tick();
  };

  it("首次挂载已有的内容整段直接显示", () => {
    const { result } = renderHook(() => useSmoothText("已经有的一大段内容", true));
    expect(result.current).toEqual({ text: "已经有的一大段内容", backlog: false });
  });

  it("流式中追加的内容按帧放出，放完后没有积压", () => {
    const { result, rerender } = renderHook(({ target }) => useSmoothText(target, true), {
      initialProps: { target: "开头" },
    });
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
    const { result, rerender } = renderHook(({ target }) => useSmoothText(target, true), {
      initialProps: { target: "" },
    });
    rerender({ target: "x".repeat(120) });
    tick();
    expect(result.current.text.length).toBe(10);
    tick();
    expect(result.current.text.length).toBe(10 + Math.ceil(110 / 12));
  });

  it("流式结束后，剩下的积压继续放完", () => {
    const { result, rerender } = renderHook(({ target, streaming }) => useSmoothText(target, streaming), {
      initialProps: { target: "a", streaming: true },
    });
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
    const { result, rerender } = renderHook(({ target, streaming }) => useSmoothText(target, streaming), {
      initialProps: { target: "", streaming: true },
    });
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
    const { result, rerender } = renderHook(({ target }) => useSmoothText(target, true), {
      initialProps: { target: "很长很长的旧回复" },
    });
    rerender({ target: "新" });
    expect(result.current).toEqual({ text: "新", backlog: false });
  });

  it("不是在末尾追加（被改写）时直接显示全部", () => {
    const { result, rerender } = renderHook(({ target }) => useSmoothText(target, true), {
      initialProps: { target: "旧回复内容" },
    });
    rerender({ target: "完全不同的另一条回复，比较长一些" });
    expect(result.current.backlog).toBe(false);
    expect(result.current.text).toBe("完全不同的另一条回复，比较长一些");
  });

  it("不在流式中时，追加的内容直接显示全部", () => {
    const { result, rerender } = renderHook(({ target }) => useSmoothText(target, false), {
      initialProps: { target: "a" },
    });
    rerender({ target: "a" + "b".repeat(50) });
    expect(result.current.backlog).toBe(false);
    expect(result.current.text).toHaveLength(51);
  });
});

describe("MarkdownProse 流式效果", () => {
  let frames: Array<() => void>;
  beforeEach(() => {
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });
  afterEach(() => vi.unstubAllGlobals());
  const tick = () =>
    act(() => {
      const batch = frames;
      frames = [];
      batch.forEach((callback) => {
        callback();
      });
    });

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

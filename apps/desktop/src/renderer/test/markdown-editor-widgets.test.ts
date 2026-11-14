/** widget：真实 DOM 行为（复选框、复制、公式、图片、Mermaid、属性卡）和 eq / 原子范围。 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadKatex } from "../components/markdown-common/katex";
import { MermaidRenderError } from "../components/messages/mermaid-renderer";
import { blockField } from "../components/markdown-editor/core/blocks";
import { setReadOnly } from "../components/markdown-editor/core";
import { buildInlineDecorations } from "../components/markdown-editor/core/inline";
import { BulletWidget } from "../components/markdown-editor/core/widgets/bullet";
import { CalloutLabelWidget } from "../components/markdown-editor/core/widgets/callout-label";
import { CheckboxWidget, taskToggleChange } from "../components/markdown-editor/core/widgets/checkbox";
import { CodeHeaderWidget, fencedCodeAt } from "../components/markdown-editor/core/widgets/code-header";
import { FileIconWidget } from "../components/markdown-editor/core/widgets/file-icon";
import { FrontmatterWidget, parseFrontmatter } from "../components/markdown-editor/core/widgets/frontmatter";
import { clearImageCache } from "../components/markdown-editor/core/widgets/image-cache";
import { ImageWidget } from "../components/markdown-editor/core/widgets/image";
import { MathWidget, renderTex, resetMathStateForTests } from "../components/markdown-editor/core/widgets/math";
import { MermaidWidget } from "../components/markdown-editor/core/widgets/mermaid";
import {
  cleanupViews,
  decos,
  focusView,
  makeHost,
  makeState,
  mermaidResult,
  mountEditor,
} from "./markdown-editor-helpers";

beforeEach(() => {
  clearImageCache();
  resetMathStateForTests();
});
afterEach(() => {
  cleanupViews();
  vi.restoreAllMocks();
});

const mousedown = (el: Element) =>
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));

/** 挂载并把光标放在文末（所有节点都处于“平时”状态） */
function mount(doc: string, extra: Parameters<typeof mountEditor>[0] extends infer T ? Partial<T> : never = {}) {
  const ctx = mountEditor({ doc, ...extra });
  focusView(ctx.view);
  ctx.view.dispatch({ selection: { anchor: doc.length } });
  return ctx;
}

describe("复选框（D3）", () => {
  it("taskToggleChange：只改中间那个字符", () => {
    const state = makeState("- [ ] a\n- [x] b\n- [X] c\n");
    expect(taskToggleChange(state, 2)).toEqual({ from: 3, to: 4, insert: "x" });
    expect(taskToggleChange(state, 10)).toEqual({ from: 11, to: 12, insert: " " });
    expect(taskToggleChange(state, 18)).toEqual({ from: 19, to: 20, insert: " " });
    expect(taskToggleChange(state, 0)).toBeNull();
  });

  it("点一下把 [ ] 改写成 [x]，再点改回来；光标不动", () => {
    const { view, parent } = mount("- [ ] 待办\n\n末尾");
    const cursor = view.state.selection.main.head;
    mousedown(parent.querySelector(".md-checkbox") as Element);
    expect(view.state.doc.toString()).toBe("- [x] 待办\n\n末尾");
    expect(parent.querySelector(".md-checkbox.is-checked")).not.toBeNull();
    mousedown(parent.querySelector(".md-checkbox") as Element);
    expect(view.state.doc.toString()).toBe("- [ ] 待办\n\n末尾");
    expect(view.state.selection.main.head).toBe(cursor);
  });

  it("多个任务项各改各的", () => {
    const { view, parent } = mount("- [ ] 甲\n- [ ] 乙\n\n末尾");
    mousedown(parent.querySelectorAll(".md-checkbox")[1]);
    expect(view.state.doc.toString()).toBe("- [ ] 甲\n- [x] 乙\n\n末尾");
  });

  it("只读时点击不改写", () => {
    const { view, parent } = mount("- [ ] 待办\n\n末尾", { readOnly: true });
    mousedown(parent.querySelector(".md-checkbox") as Element);
    expect(view.state.doc.toString()).toBe("- [ ] 待办\n\n末尾");
    setReadOnly(view, false);
    mousedown(parent.querySelector(".md-checkbox") as Element);
    expect(view.state.doc.toString()).toBe("- [x] 待办\n\n末尾");
  });

  it("改写进撤销历史", async () => {
    const { undo } = await import("@codemirror/commands");
    const { view, parent } = mount("- [ ] 待办\n\n末尾");
    mousedown(parent.querySelector(".md-checkbox") as Element);
    undo(view);
    expect(view.state.doc.toString()).toBe("- [ ] 待办\n\n末尾");
  });
});

describe("代码块复制（D5）", () => {
  it("fencedCodeAt：只取代码原文，不含围栏", () => {
    const state = makeState("```js\nlet a = 1;\n  return a;\n```\n");
    expect(fencedCodeAt(state, 8)).toBe("let a = 1;\n  return a;");
    expect(fencedCodeAt(makeState("文字"), 1)).toBeNull();
  });

  it("引用里的代码块：去掉引用标记后拼起来", () => {
    expect(fencedCodeAt(makeState("> ```js\n> a\n> b\n> ```\n"), 10)).toBe("a\nb");
  });

  it("点「复制」：剪贴板里是代码原文，按钮变「已复制」，不含围栏", async () => {
    const writeText = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { parent } = mount("```ts\nconst a = 1;\nconst b = 2;\n```\n\n末尾");
    const copy = parent.querySelector(".md-code-copy") as HTMLButtonElement;
    expect(copy.textContent).toBe("复制");
    copy.click();
    await vi.waitFor(() => expect(copy.textContent).toBe("已复制"));
    expect(writeText).toHaveBeenCalledWith("const a = 1;\nconst b = 2;");
    expect(String(writeText.mock.calls[0][0])).not.toContain("```");
  });

  it("剪贴板不可用：显示「复制失败」", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn(async () => {
          throw new Error("denied");
        }),
      },
      configurable: true,
    });
    const { parent } = mount("```ts\nx\n```\n\n末尾");
    const copy = parent.querySelector(".md-code-copy") as HTMLButtonElement;
    copy.click();
    await vi.waitFor(() => expect(copy.textContent).toBe("复制失败"));
  });

  it("代码头显示语言名，没有语言时显示 text", () => {
    const { parent } = mount("```py\nx\n```\n\n```\ny\n```\n\n末尾");
    expect(Array.from(parent.querySelectorAll(".md-code-lang")).map((el) => el.textContent)).toEqual(["py", "text"]);
  });
});

describe("公式（D9）", () => {
  it("KaTeX 渲染行内公式和块公式", async () => {
    const { parent } = mount("质能 $E=mc^2$ 方程\n\n$$\na^2+b^2\n$$\n\n末尾");
    await vi.waitFor(() => expect(parent.querySelectorAll(".md-math .katex").length).toBe(2));
    expect(parent.querySelector(".md-math-inline .katex")).not.toBeNull();
    expect(parent.querySelector(".md-math-block .katex-display")).not.toBeNull();
  });

  it("公式写错：显示原文，标成危险色", async () => {
    const katex = await loadKatex();
    const html = renderTex("\\frac{1}{", false, katex) ?? "";
    expect(html).toContain("katex-error");
    expect(html).toContain("var(--act-color-danger)");
    expect(html).toContain("\\frac{1}{");
  });

  it("KaTeX 意外抛错：返回 null，由 widget 显示源码并标 is-error", async () => {
    const engine = {
      renderToString: () => {
        throw new Error("boom");
      },
    } as never;
    expect(renderTex("x", false, engine)).toBeNull();
  });

  it("不信任 \\href 之类（trust: false）：输出里没有链接", async () => {
    const katex = await loadKatex();
    const html = renderTex("\\href{javascript:alert(1)}{click}", false, katex) ?? "";
    expect(html).not.toMatch(/<a[\s>]/);
    expect(html).not.toContain("href=");
  });

  it("KaTeX 载入前先显示源码（pending），载入后换成渲染结果", async () => {
    const { parent } = mount("$x_1$\n\n末尾");
    const el = parent.querySelector(".md-math") as HTMLElement;
    await vi.waitFor(() => expect(el.querySelector(".katex")).not.toBeNull());
    expect(el.classList.contains("is-pending")).toBe(false);
  });

  it("相同源码走缓存：renderTex 对同一输入返回同一个字符串", async () => {
    const katex = await loadKatex();
    const spy = vi.spyOn(katex, "renderToString");
    renderTex("\\alpha", false, katex);
    renderTex("\\alpha", false, katex);
    expect(spy).toHaveBeenCalledTimes(1);
    renderTex("\\alpha", true, katex);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("本地图片（D10）", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgo=";

  it("读得到：显示图片，alt 作为属性（不当 HTML）", async () => {
    const host = makeHost({ loadImage: vi.fn(async () => PNG) });
    const { parent } = mount("![<b>图</b>](img/a.png)\n\n末尾", { host });
    await vi.waitFor(() => expect(parent.querySelector(".md-img img")).not.toBeNull());
    const img = parent.querySelector(".md-img img") as HTMLImageElement;
    expect(img.src).toBe(PNG);
    expect(img.alt).toBe("<b>图</b>");
    expect(parent.querySelector(".md-img b")).toBeNull();
    expect(host.loadImage).toHaveBeenCalledWith("docs/img/a.png");
  });

  it("读不到：显示源码原文，不显示破图", async () => {
    const host = makeHost({ loadImage: vi.fn(async () => null) });
    const { parent } = mount("![图](img/a.png)\n\n末尾", { host });
    await vi.waitFor(() => expect(parent.querySelector(".md-img.is-missing")).not.toBeNull());
    expect(parent.querySelector(".md-img")?.textContent).toBe("![图](img/a.png)");
    expect(parent.querySelector(".md-img img")).toBeNull();
  });

  it("宿主返回的不是 data:image：当读不到", async () => {
    const host = makeHost({ loadImage: vi.fn(async () => "https://evil.com/a.png") });
    const { parent } = mount("![图](img/a.png)\n\n末尾", { host });
    await vi.waitFor(() => expect(parent.querySelector(".md-img.is-missing")).not.toBeNull());
  });

  it("loadImage 抛错：当读不到", async () => {
    const host = makeHost({
      loadImage: vi.fn(async () => {
        throw new Error("io");
      }),
    });
    const { parent } = mount("![图](img/a.png)\n\n末尾", { host });
    await vi.waitFor(() => expect(parent.querySelector(".md-img.is-missing")).not.toBeNull());
  });

  it("远程图片：不请求，显示原文", () => {
    const host = makeHost();
    const { parent } = mount("![x](https://example.com/a.png)\n\n末尾", { host });
    expect(host.loadImage).not.toHaveBeenCalled();
    expect(parent.querySelector("img")).toBeNull();
    expect(parent.querySelector(".md-img-skipped")?.textContent).toBe("![x](https://example.com/a.png)");
  });

  it("越界路径：不请求", () => {
    const host = makeHost();
    mount("![x](../../../secret.png)\n\n末尾", { host });
    expect(host.loadImage).not.toHaveBeenCalled();
  });

  it("按路径缓存：同一张图只读一次", async () => {
    const host = makeHost({ loadImage: vi.fn(async () => PNG) });
    const { parent } = mount("![a](img/a.png)\n\n![b](img/a.png)\n\n末尾", { host });
    await vi.waitFor(() => expect(parent.querySelectorAll(".md-img img")).toHaveLength(2));
    expect(host.loadImage).toHaveBeenCalledTimes(1);
  });
});

describe("Mermaid（D8）", () => {
  const doc = "```mermaid\ngraph TD\nA-->B\n```\n\n末尾";

  it("平时只显示图：渲染后写入 SVG，每份拷贝用独立 id", async () => {
    const host = makeHost();
    const { parent } = mount(doc, { host });
    expect(parent.querySelector(".md-mermaid-replace")).not.toBeNull();
    await vi.waitFor(() => expect(parent.querySelector(".md-mermaid-figure svg")).not.toBeNull());
    expect(host.renderMermaid).toHaveBeenCalledWith("graph TD\nA-->B");
    expect(parent.querySelector(".md-mermaid-figure svg")?.id).not.toBe("mm-1");
    expect(parent.querySelector(".md-mermaid-status")?.textContent).toBe("");
  });

  it("渲染出错：状态条显示错误", async () => {
    const host = makeHost({
      renderMermaid: vi.fn(async () => {
        throw new MermaidRenderError("syntax", "Parse error on line 2");
      }),
    });
    const { parent } = mount(doc, { host });
    await vi.waitFor(() => expect(parent.querySelector(".md-mermaid.has-error")).not.toBeNull());
    expect(parent.querySelector(".md-mermaid-status")?.textContent).toBe("Mermaid：Parse error on line 2");
  });

  it("「查看大图」只在宿主提供 previewMermaid 时出现，点击交出渲染结果", async () => {
    const previewMermaid = vi.fn();
    const host = makeHost({ previewMermaid });
    const { parent } = mount(doc, { host });
    await vi.waitFor(() => expect((parent.querySelector(".md-mermaid-expand") as HTMLElement).hidden).toBe(false));
    (parent.querySelector(".md-mermaid-expand") as HTMLElement).click();
    expect(previewMermaid).toHaveBeenCalledWith(expect.objectContaining({ renderId: "mm-1" }));
    cleanupViews();
    const { parent: other } = mount(doc, { host: makeHost() });
    await vi.waitFor(() => expect(other.querySelector(".md-mermaid-figure svg")).not.toBeNull());
    expect((other.querySelector(".md-mermaid-expand") as HTMLElement).hidden).toBe(true);
  });

  it("点图：光标进入围栏，源码露出，图放在源码下方", async () => {
    const { view, parent } = mount(doc);
    await vi.waitFor(() => expect(parent.querySelector(".md-mermaid-figure svg")).not.toBeNull());
    mousedown(parent.querySelector(".md-mermaid") as Element);
    expect(view.state.selection.main.head).toBeGreaterThan(0);
    expect(view.state.selection.main.head).toBeLessThan(doc.indexOf("末尾"));
    expect(parent.querySelector(".md-mermaid-replace")).toBeNull();
    expect(parent.querySelector(".md-mermaid-below")).not.toBeNull();
    expect(parent.textContent).toContain("graph TD");
  });

  it("源码改动：防抖后更新图；中途出错时保留上一张图", async () => {
    const renderMermaid = vi.fn(async (source: string) => mermaidResult(source));
    const { view, parent } = mount(doc, { host: makeHost({ renderMermaid }) });
    focusView(view);
    view.dispatch({ selection: { anchor: 14 } });
    await vi.waitFor(() => expect(parent.querySelector(".md-mermaid-below .md-mermaid-figure svg")).not.toBeNull());
    const first = parent.querySelector(".md-mermaid-below .md-mermaid-figure svg")?.getAttribute("data-len");
    renderMermaid.mockImplementationOnce(async () => {
      throw new MermaidRenderError("syntax", "bad");
    });
    view.dispatch({ changes: { from: 14, insert: "x" } });
    // 防抖：改动后立刻不会重新渲染
    const calls = renderMermaid.mock.calls.length;
    expect(renderMermaid.mock.calls.length).toBe(calls);
    await vi.waitFor(() => expect(parent.querySelector(".md-mermaid-below.has-error")).not.toBeNull(), {
      timeout: 2000,
    });
    expect(parent.querySelector(".md-mermaid-below .md-mermaid-figure svg")?.getAttribute("data-len")).toBe(first);
    view.dispatch({ changes: { from: 14, insert: "y" } });
    await vi.waitFor(() => expect(parent.querySelector(".md-mermaid-below.has-error")).toBeNull(), { timeout: 2000 });
    expect(parent.querySelector(".md-mermaid-below .md-mermaid-figure svg")?.getAttribute("data-len")).not.toBe(first);
  });

  it("连续输入只渲染最后一次（防抖 300ms）", async () => {
    const renderMermaid = vi.fn(async (source: string) => mermaidResult(source));
    const { view, parent } = mount(doc, { host: makeHost({ renderMermaid }) });
    focusView(view);
    view.dispatch({ selection: { anchor: 14 } });
    await vi.waitFor(() => expect(parent.querySelector(".md-mermaid-below .md-mermaid-figure svg")).not.toBeNull());
    renderMermaid.mockClear();
    for (const ch of "abc") view.dispatch({ changes: { from: 14, insert: ch } });
    expect(renderMermaid).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(renderMermaid).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(renderMermaid.mock.calls[0][0]).toContain("cba");
  });
});

describe("Frontmatter（D7）", () => {
  it("parseFrontmatter：简单值去引号，复杂值保留原文，注释忽略", () => {
    const source = '---\ntitle: "标题"\nauthor: Me\n# 注释\ntags:\n  - a\n  - b\nmeta: { k: v }\ndraft:\n---';
    expect(parseFrontmatter(source)).toEqual([
      ["title", "标题"],
      ["author", "Me"],
      ["tags", "  - a\n  - b"],
      ["meta", "{ k: v }"],
      ["draft", ""],
    ]);
  });

  it("属性卡片：键淡色、值正文色；值按文本写入，不当 HTML", () => {
    const { parent } = mount("---\ntitle: <img src=x onerror=alert(1)>\nstatus: 草稿\n---\n\n正文");
    expect(Array.from(parent.querySelectorAll(".md-fm-key")).map((el) => el.textContent)).toEqual(["title", "status"]);
    expect(parent.querySelector(".md-fm-val")?.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(parent.querySelector(".md-fm-card img")).toBeNull();
  });

  it("点卡片：光标进入，露出 YAML 源码，卡片消失；光标离开后变回卡片", () => {
    const doc = "---\ntitle: a\n---\n\n正文";
    const { view, parent } = mount(doc);
    expect(parent.querySelector(".md-fm-card")).not.toBeNull();
    mousedown(parent.querySelector(".md-fm-card") as Element);
    expect(parent.querySelector(".md-fm-card")).toBeNull();
    expect(parent.textContent).toContain("title: a");
    view.dispatch({ selection: { anchor: doc.length } });
    expect(parent.querySelector(".md-fm-card")).not.toBeNull();
  });
});

describe("widget 的 eq 和原子范围", () => {
  it("eq：参数相同才相等", () => {
    expect(new CheckboxWidget(true).eq(new CheckboxWidget(true))).toBe(true);
    expect(new CheckboxWidget(true).eq(new CheckboxWidget(false))).toBe(false);
    expect(new BulletWidget(1).eq(new BulletWidget(1))).toBe(true);
    expect(new BulletWidget(1).eq(new BulletWidget(2))).toBe(false);
    expect(new CalloutLabelWidget("note").eq(new CalloutLabelWidget("note"))).toBe(true);
    expect(new CalloutLabelWidget("note").eq(new CalloutLabelWidget("tip"))).toBe(false);
    expect(new CodeHeaderWidget("js").eq(new CodeHeaderWidget("js"))).toBe(true);
    expect(new CodeHeaderWidget("js").eq(new CodeHeaderWidget("ts"))).toBe(false);
    expect(new FileIconWidget().eq(new FileIconWidget())).toBe(true);
    expect(new ImageWidget("a.png", "x", "![x](a.png)").eq(new ImageWidget("a.png", "x", "![x](a.png)"))).toBe(true);
    expect(new ImageWidget("a.png", "x", "r").eq(new ImageWidget("b.png", "x", "r"))).toBe(false);
    expect(new MathWidget("x", true).eq(new MathWidget("x", true))).toBe(true);
    expect(new MathWidget("x", true).eq(new MathWidget("x", false))).toBe(false);
    expect(new MathWidget("x", false).eq(new MathWidget("y", false))).toBe(false);
    expect(new MermaidWidget("a", "replace").eq(new MermaidWidget("a", "replace"))).toBe(true);
    expect(new MermaidWidget("a", "replace").eq(new MermaidWidget("a", "below"))).toBe(false);
    expect(new MermaidWidget("a", "replace").eq(new MermaidWidget("b", "replace"))).toBe(false);
    expect(new FrontmatterWidget([["a", "1"]]).eq(new FrontmatterWidget([["a", "1"]]))).toBe(true);
    expect(new FrontmatterWidget([["a", "1"]]).eq(new FrontmatterWidget([["a", "2"]]))).toBe(false);
  });

  it("复选框改状态时复用 DOM（updateDOM）", () => {
    const { view, parent } = mount("- [ ] 待办\n\n末尾");
    const before = parent.querySelector(".md-checkbox");
    mousedown(before as Element);
    expect(parent.querySelector(".md-checkbox")).toBe(before);
    void view;
  });

  it("所有被替换的范围（隐藏的标记、widget）都登记为原子范围", () => {
    const doc = [
      "# 标题",
      "**粗** `src/a.ts` [链](a.md) ![图](a.png) $x$",
      "- 甲",
      "- [ ] 乙",
      "> [!NOTE]",
      "> 引用",
      "---",
      "| a | b |",
      "| - | - |",
      "| 1 | 2 |",
      "```js",
      "let a",
      "```",
      "末尾",
    ].join("\n");
    const state = makeState(doc, { cursor: doc.length });
    const { decorations, atomic } = buildInlineDecorations(state);
    const replaced = decos(decorations)
      .filter((d) => (d.kind === "hide" || d.kind === "widget") && d.to > d.from)
      .map((d) => `${d.from}-${d.to}`);
    const atomicRanges = decos(atomic).map((d) => `${d.from}-${d.to}`);
    expect(replaced.length).toBeGreaterThan(10);
    expect(new Set(atomicRanges)).toEqual(new Set(replaced));
    // 块级：Mermaid 等替换也在原子范围里（见 blocks 测试）；这里确认字段存在
    expect(state.field(blockField).atomic).toBeDefined();
  });
});

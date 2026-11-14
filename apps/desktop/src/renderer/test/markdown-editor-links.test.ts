import { afterEach, describe, expect, it, vi } from "vitest";
import { clickTargetAt, DRAG_THRESHOLD, openClickTarget } from "../components/markdown-editor/core/links";
import { setMode } from "../components/markdown-editor/core";
import { at, cleanupViews, focusView, makeState, mountEditor } from "./markdown-editor-helpers";

afterEach(cleanupViews);

/** 光标在 `⌶` 处，取该处的点击目标 */
function targetOf(source: string) {
  const { doc, cursor } = at(source);
  return clickTargetAt(makeState(doc), cursor);
}

describe("clickTargetAt：每个分支", () => {
  it("行内代码路径 -> path（带行号）", () => {
    expect(targetOf("`src/a⌶pp.ts`")).toEqual({ kind: "path", relativePath: "src/app.ts" });
    expect(targetOf("`src/a⌶pp.ts:42`")).toEqual({ kind: "path", relativePath: "src/app.ts", line: 42 });
    expect(targetOf("`./sib⌶ling.md`")).toEqual({ kind: "path", relativePath: "docs/sibling.md" });
  });

  it("行内代码不是路径 -> 不可点", () => {
    expect(targetOf("`1.2⌶.3`")).toBeNull();
    expect(targetOf("`co⌶nsole.log`")).toBeNull();
    expect(targetOf("`/etc/pa⌶sswd`")).toBeNull();
  });

  it("本地链接 -> path，相对当前文档所在目录", () => {
    expect(targetOf("[文⌶字](other.md)")).toEqual({ kind: "path", relativePath: "docs/other.md" });
    expect(targetOf("[文⌶字](../README.md)")).toEqual({ kind: "path", relativePath: "README.md" });
    expect(targetOf("[文⌶字](sub/a.ts:12)")).toEqual({ kind: "path", relativePath: "docs/sub/a.ts", line: 12 });
    expect(targetOf("[文⌶字](/work/space/src/a.ts)")).toEqual({ kind: "path", relativePath: "src/a.ts" });
  });

  it("外链 -> external：http、https、mailto", () => {
    expect(targetOf("[文⌶字](https://example.com/a)")).toEqual({ kind: "external", url: "https://example.com/a" });
    expect(targetOf("[文⌶字](mailto:a@b.c)")).toEqual({ kind: "external", url: "mailto:a@b.c" });
  });

  it("锚点 -> anchor", () => {
    expect(targetOf("[文⌶字](#安装)")).toEqual({ kind: "anchor", id: "安装" });
  });

  it("其他协议、工作区外、越界 -> 不可点", () => {
    expect(targetOf("[文⌶字](javascript:alert(1))")).toBeNull();
    expect(targetOf("[文⌶字](file:///etc/passwd)")).toBeNull();
    expect(targetOf("[文⌶字](/etc/passwd)")).toBeNull();
    expect(targetOf("[文⌶字](../../../x.md)")).toBeNull();
    expect(targetOf("[文⌶字](~/x.md)")).toBeNull();
  });

  it("裸 URL 和 <自动链接> -> external", () => {
    expect(targetOf("见 https://exa⌶mple.com 这里")).toEqual({ kind: "external", url: "https://example.com" });
    expect(targetOf("<https://exa⌶mple.com>")).toEqual({ kind: "external", url: "https://example.com" });
  });

  it("图片、普通文字 -> 不可点", () => {
    expect(targetOf("![al⌶t](a.png)")).toBeNull();
    expect(targetOf("普⌶通文字 src/a.ts")).toBeNull();
  });

  it("链接文字里的行内代码属于外层链接", () => {
    expect(targetOf("[`co⌶de`](other.md)")).toEqual({ kind: "path", relativePath: "docs/other.md" });
  });
});

describe("openClickTarget", () => {
  it("path / external 交给宿主，锚点在文档内滚动", () => {
    const { view, host } = mountEditor({ doc: "# 开头\n\n## 安装\n\n正文\n" });
    expect(openClickTarget(view, { kind: "path", relativePath: "a.ts", line: 3 })).toBe(true);
    expect(host.openPath).toHaveBeenCalledWith("a.ts", 3);
    expect(openClickTarget(view, { kind: "external", url: "https://x.com" })).toBe(true);
    expect(host.openUrl).toHaveBeenCalledWith("https://x.com");
    const scroll = vi.spyOn(view, "dispatch");
    expect(openClickTarget(view, { kind: "anchor", id: "安装" })).toBe(true);
    expect(scroll).toHaveBeenCalled();
    expect(openClickTarget(view, { kind: "anchor", id: "不存在" })).toBe(false);
  });

  it("锚点不区分大小写", () => {
    const { view } = mountEditor({ doc: "## Hello World\n" });
    expect(openClickTarget(view, { kind: "anchor", id: "Hello-World" })).toBe(true);
  });
});

describe("点击手势（真实 DOM 事件）", () => {
  function setup(doc: string) {
    const ctx = mountEditor({ doc });
    focusView(ctx.view);
    ctx.view.dispatch({ selection: { anchor: ctx.view.state.doc.length } }); // 光标放到文末，链接处于收起状态
    return ctx;
  }
  const down = (target: Element, init: MouseEventInit = {}) => {
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 1,
      clientX: 10,
      clientY: 10,
      ...init,
    });
    target.dispatchEvent(event);
    return event;
  };
  const move = (x: number, y: number) => window.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y }));
  const up = () => window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

  it("单击链接：mouseup 时打开，不移动光标", () => {
    const { view, parent, host } = setup("[文字](other.md)\n\n末尾");
    const before = view.state.selection.main.head;
    const link = parent.querySelector(".md-link") as Element;
    expect(link).not.toBeNull();
    const event = down(link);
    expect(event.defaultPrevented).toBe(true);
    expect(host.openPath).not.toHaveBeenCalled();
    up();
    expect(host.openPath).toHaveBeenCalledWith("docs/other.md", undefined);
    expect(view.state.selection.main.head).toBe(before);
  });

  it("单击行内代码路径：打开并带行号", () => {
    const { parent, host } = setup("看 `src/a.ts:42`\n\n末尾");
    down(parent.querySelector(".md-path") as Element);
    up();
    expect(host.openPath).toHaveBeenCalledWith("src/a.ts", 42);
  });

  it("单击外链：交给 openUrl", () => {
    const { parent, host } = setup("[x](https://example.com)\n\n末尾");
    down(parent.querySelector(".md-link") as Element);
    up();
    expect(host.openUrl).toHaveBeenCalledWith("https://example.com");
  });

  it("按下后拖动超过阈值：当作拖选，不打开", () => {
    const { parent, host } = setup("[文字](other.md)\n\n末尾");
    down(parent.querySelector(".md-link") as Element, { clientX: 10, clientY: 10 });
    move(10 + DRAG_THRESHOLD + 20, 10);
    up();
    expect(host.openPath).not.toHaveBeenCalled();
  });

  it("按下后只抖动几个像素：仍算单击", () => {
    const { parent, host } = setup("[文字](other.md)\n\n末尾");
    down(parent.querySelector(".md-link") as Element, { clientX: 10, clientY: 10 });
    move(10 + DRAG_THRESHOLD - 1, 10);
    up();
    expect(host.openPath).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["⌘", { metaKey: true }],
    ["Ctrl", { ctrlKey: true }],
    ["Shift", { shiftKey: true }],
    ["Alt", { altKey: true }],
    ["右键", { button: 2 }],
    ["双击", { detail: 2 }],
  ])("%s 单击不打开", (_name, init) => {
    const { parent, host } = setup("[文字](other.md)\n\n末尾");
    down(parent.querySelector(".md-link") as Element, init);
    up();
    expect(host.openPath).not.toHaveBeenCalled();
  });

  it("不可点的链接（javascript:）不接管点击", () => {
    const { parent, host } = setup("[文字](javascript:alert(1))\n\n末尾");
    expect(parent.querySelector(".md-link")).toBeNull();
    expect(host.openUrl).not.toHaveBeenCalled();
  });

  it("只读时仍然可以打开链接", () => {
    const { parent, host } = (() => {
      const ctx = mountEditor({ doc: "[文字](other.md)\n\n末尾", readOnly: true });
      focusView(ctx.view);
      return ctx;
    })();
    down(parent.querySelector(".md-link") as Element);
    up();
    expect(host.openPath).toHaveBeenCalled();
  });

  it("源码模式下没有链接样式，点击不打开", () => {
    const { view, parent, host } = setup("[文字](other.md)\n\n末尾");
    setMode(view, "source");
    expect(parent.querySelector(".md-link")).toBeNull();
    down(parent.querySelector(".cm-line") as Element);
    up();
    expect(host.openPath).not.toHaveBeenCalled();
  });
});

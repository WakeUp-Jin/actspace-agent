import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodeRenderView } from "../components/right-panel/CodeRenderView";

/**
 * 代码视图的验收探针（见 front-右侧面板与文件渲染规范.md）：
 * - 语法高亮真的生效（这是本轮优化的起点：原来根本没有 token 着色）；
 * - 行号与逻辑行一一对应，且不会被复制选中；
 * - 长行固定折行，且视图内不摆任何按钮（文件级动作都在工作区操作栏上）；
 * - 超长文件截断渲染并说明原因。
 */

function lineTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-line-index]")).map((node) => node.textContent ?? "");
}

describe("CodeRenderView", () => {
  const scrollToDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
  beforeEach(() => {
    // jsdom has no layout. Supply viewport and wrapped-row measurements to the real virtualizer.
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function () { return this.hasAttribute("data-index") ? 20 : 600; });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return Number(this.querySelector<HTMLElement>("[data-code-total-lines]")?.dataset.codeTotalLines ?? 30) * 20;
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: function (options: ScrollToOptions) {
      this.scrollTop = options.top ?? this.scrollTop;
      fireEvent.scroll(this);
    } });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (scrollToDescriptor) Object.defineProperty(HTMLElement.prototype, "scrollTo", scrollToDescriptor);
    else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo;
  });
  it("emits highlight.js token classes for a known language", () => {
    const { container } = render(<CodeRenderView content={"const answer = 42;"} language="typescript" />);

    expect(container.querySelector(".hljs-keyword")?.textContent).toBe("const");
    expect(container.querySelector(".hljs-number")?.textContent).toBe("42");
  });

  it("keeps multi-line tokens readable by reopening spans on every line", () => {
    const { container } = render(
      <CodeRenderView content={"/* block\n   comment */\nconst x = 1;"} language="typescript" />,
    );

    const lines = Array.from(container.querySelectorAll("[data-line-index]"));
    // 跨行注释的第二行也必须自带 comment 样式，否则高亮会在换行处断掉。
    expect(lines[0].querySelector(".hljs-comment")).not.toBeNull();
    expect(lines[1].querySelector(".hljs-comment")).not.toBeNull();
    expect(lines[1].textContent).toContain("comment */");
  });

  it("renders one gutter number per logical line and hides it from copy/a11y", () => {
    const { container } = render(<CodeRenderView content={"a\nb\nc"} language="text" />);

    const gutters = Array.from(container.querySelectorAll("[data-line-number]"));
    expect(gutters.map((node) => node.textContent)).toEqual(["1", "2", "3"]);
    expect(gutters.every((node) => node.className.includes("select-none"))).toBe(true);
    expect(gutters.every((node) => node.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(lineTexts(container)).toEqual(["a", "b", "c"]);
    // 仍可能有不可断的超长 token 顶出横向滚动，行号必须钉住。
    expect(gutters.every((node) => node.className.includes("sticky"))).toBe(true);
    expect(gutters.every((node) => node.className.includes("left-0"))).toBe(true);
  });

  it("wraps long lines and never falls back to max-content width", () => {
    // 只断言 whitespace 类是不够的：grid 若是 `w-max`，代码列宽 = 最长行宽，
    // 于是永远没有需要折行的机会，看着设了 pre-wrap 实际没折。jsdom 不做布局，只能锁类名契约。
    const { container } = render(<CodeRenderView content={"a very long line"} language="text" />);

    expect(container.querySelector("[data-line-index]")?.className).toContain("whitespace-pre-wrap");
    const grid = container.querySelector<HTMLElement>(".grid")?.className ?? "";
    expect(grid).toContain("w-full");
    expect(grid).not.toContain("w-max");
  });

  it("puts no buttons in the view itself", () => {
    // 查找 / 复制 / 换行开关都已撤掉；文件级动作集中在工作区操作栏，视图只负责读。
    render(<CodeRenderView content={"a\nb"} language="text" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("escapes markup in unknown-language content instead of injecting it", () => {
    const { container } = render(<CodeRenderView content={"<img src=x onerror=alert(1)>"} />);

    expect(container.querySelector("img")).toBeNull();
    expect(lineTexts(container)).toEqual(["<img src=x onerror=alert(1)>"]);
  });

  it("caps the rendered rows for a very long file and says so", () => {
    // 每行两个 DOM 节点，2MB 日志有二十万行；不设上限面板会卡死几十秒。
    const content = Array.from({ length: 20500 }, (_, index) => `line ${index}`).join("\n");
    const { container } = render(<CodeRenderView content={content} language="text" />);

    expect(container.querySelectorAll("[data-line-index]").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("[data-line-index]").length).toBeLessThan(300);
    expect(screen.getByText(/仅渲染前 20,000 行，另有 500 行未显示/)).toBeInTheDocument();
  }, 20_000);

  it("does not announce a cap for ordinary files", () => {
    render(<CodeRenderView content={"a\nb\nc"} language="text" />);
    expect(screen.queryByText(/仅渲染前/)).toBeNull();
  });

  it("shows the first screen immediately for a large file", () => {
    const content = Array.from({ length: 5000 }, (_, index) => `const v${index} = ${index};`).join("\n");
    const { container } = render(<CodeRenderView content={content} language="typescript" />);

    // 首屏可读且有高亮；不可见行不能继续挂载两万行 DOM。
    const lines = Array.from(container.querySelectorAll("[data-line-index]"));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThan(300);
    expect(within(lines[0] as HTMLElement).getByText("const")).toBeInTheDocument();
    expect(container.querySelector('[data-line-index="4999"]')).toBeNull();
  });

  it("copies the full capped source across unmounted rows without gutters or the notice", () => {
    const lines = Array.from({ length: 20500 }, (_, index) => `中文😀 ${index}\t<value>`);
    const { container } = render(<CodeRenderView content={lines.join("\n")} language="text" />);
    const view = screen.getByLabelText("文件内容");
    act(() => view.focus());
    fireEvent.keyDown(view, { key: "a", metaKey: true });
    const setData = vi.fn();
    fireEvent.copy(view, { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith("text/plain", lines.slice(0, 20000).join("\n"));
    expect(container.querySelector('[data-line-index="19999"]')).toBeNull();
    expect(container.querySelectorAll("[data-line-index]").length).toBeLessThan(300);
  });

  it("preserves a keyboard range after its anchor row unmounts and resets it for a new file", async () => {
    const lines = Array.from({ length: 5000 }, (_, index) => `const 中文${index} = '😀';`);
    const { container, rerender } = render(<CodeRenderView content={lines.join("\n")} language="typescript" />);
    const view = screen.getByLabelText("文件内容");
    act(() => view.focus());
    fireEvent.keyDown(view, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(view, { key: "End", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(container.querySelector('[data-line-index="4999"]')).not.toBeNull());
    expect(container.querySelector('[data-line-index="0"]')).toBeNull();
    const setData = vi.fn();
    fireEvent.copy(view, { clipboardData: { setData } });
    expect(setData).toHaveBeenLastCalledWith("text/plain", lines.join("\n"));
    const other = lines.map(line => line.replace("中文", "另一个"));
    rerender(<CodeRenderView content={other.join("\n")} language="typescript" />);
    setData.mockClear();
    fireEvent.copy(screen.getByLabelText("文件内容"), { clipboardData: { setData } });
    expect(setData).not.toHaveBeenCalled();
    act(() => screen.getByLabelText("文件内容").focus());
    fireEvent.keyDown(screen.getByLabelText("文件内容"), { key: "a", ctrlKey: true });
    fireEvent.copy(screen.getByLabelText("文件内容"), { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith("text/plain", other.join("\n"));
  });

  it("does not reclaim an external native selection when the code window rerenders", () => {
    const content = Array.from({ length: 5000 }, (_, index) => `line ${index}`).join("\n");
    const { container, rerender } = render(<><p tabIndex={0}>outside text</p><CodeRenderView content={content} /></>);
    const view = screen.getByLabelText("文件内容");
    act(() => view.focus());
    fireEvent.keyDown(view, { key: "a", ctrlKey: true });
    const outside = screen.getByText("outside text");
    act(() => outside.focus());
    document.getSelection()!.setBaseAndExtent(outside.firstChild!, 0, outside.firstChild!, 7);
    rerender(<><p tabIndex={0}>outside text</p><CodeRenderView content={content} /></>);
    expect(document.getSelection()!.toString()).toBe("outside");
    expect(container.querySelectorAll("[data-line-index]").length).toBeLessThan(300);
  });

  it("renders a huge single line safely without blocking on syntax highlighting", () => {
    const content = '<img src=x onerror=alert(1)>'.repeat(12000);
    const { container } = render(<CodeRenderView content={content} language="html" />);
    expect(container.querySelector("img")).toBeNull();
    expect(lineTexts(container)).toEqual([content]);
  });
});

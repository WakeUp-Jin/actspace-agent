import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

    expect(container.querySelectorAll("[data-line-index]")).toHaveLength(20000);
    expect(screen.getByText(/仅渲染前 20,000 行，另有 500 行未显示/)).toBeInTheDocument();
  });

  it("does not announce a cap for ordinary files", () => {
    render(<CodeRenderView content={"a\nb\nc"} language="text" />);
    expect(screen.queryByText(/仅渲染前/)).toBeNull();
  });

  it("shows the first screen immediately for a large file", () => {
    const content = Array.from({ length: 5000 }, (_, index) => `const v${index} = ${index};`).join("\n");
    const { container } = render(<CodeRenderView content={content} language="typescript" />);

    // 首屏同步高亮，尾部先按纯文本落地，界面不空白也不卡。
    const lines = Array.from(container.querySelectorAll("[data-line-index]"));
    expect(lines).toHaveLength(5000);
    expect(within(lines[0] as HTMLElement).getByText("const")).toBeInTheDocument();
    expect(lines[4999].textContent).toBe("const v4999 = 4999;");
  });
});

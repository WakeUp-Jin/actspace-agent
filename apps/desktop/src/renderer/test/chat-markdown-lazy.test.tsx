import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 数 renderMarkdown 的调用次数，并记录两个懒加载 chunk 是否被加载过（chunk 模块被 mock 包一层，工厂只在第一次 import 时运行）。
const hoisted = vi.hoisted(() => ({ markdown: vi.fn(), loads: { math: 0, html: 0 } }));
vi.mock("../components/messages/markdown/processor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../components/messages/markdown/processor")>();
  return {
    ...actual,
    renderMarkdown: (...args: Parameters<typeof actual.renderMarkdown>) => {
      hoisted.markdown(args[0]);
      return actual.renderMarkdown(...args);
    },
  };
});
vi.mock("../components/messages/markdown/math-chunk", async (importOriginal) => {
  hoisted.loads.math += 1;
  return importOriginal();
});
vi.mock("../components/messages/markdown/html-chunk", async (importOriginal) => {
  hoisted.loads.html += 1;
  return importOriginal();
});

import { MarkdownProse } from "../components/messages/MarkdownProse";
import {
  HTML_TAG_PATTERN,
  needsHtml,
  needsMath,
  resetLazyPluginsForTests,
} from "../components/messages/markdown/lazy-plugins";

const sources = () => hoisted.markdown.mock.calls.map((call) => String(call[0]));
const countOf = (needle: string) => sources().filter((source) => source.includes(needle)).length;

beforeEach(() => hoisted.markdown.mockClear());

describe("按需加载的判定", () => {
  it("数学：源码里出现 $ 才需要", () => {
    expect(needsMath("没有公式")).toBe(false);
    expect(needsMath("价格 $5")).toBe(true);
  });

  it("原始 HTML：只有像标签的文本才需要", () => {
    for (const html of ["<details>", "</details>", "<kbd>x</kbd>", "<br/>", "<img src=x>", "<a href=x>"])
      expect(needsHtml(html)).toBe(true);
    for (const text of ["a < b", "1<2>3", "x <- y", "<3 爱心", "没有标签"]) expect(needsHtml(text)).toBe(false);
    expect(HTML_TAG_PATTERN.test("<script>")).toBe(true);
  });
});

// 注意顺序：第一个用例必须在任何 chunk 被加载之前跑。
describe("懒加载 chunk", () => {
  it("回复里没有 $ 也没有 HTML 标签：两个 chunk 都不加载", async () => {
    const { container } = render(
      <MarkdownProse content={"普通正文 **加粗** `code`\n\n- 列表\n\n> 引用\n\n| a | b |\n|---|---|\n| 1 | 2 |"} />,
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(container.querySelector("strong")).not.toBeNull();
    expect(hoisted.loads).toEqual({ math: 0, html: 0 });
  });

  it("出现 $ 才加载数学 chunk，不加载 HTML chunk；加载前显示原文，加载后渲染公式", async () => {
    const { container } = render(<MarkdownProse content={"公式 $x^2$ 在这里"} />);
    expect(container.querySelector(".katex")).toBeNull();
    expect(container.textContent).toContain("$x^2$");
    await waitFor(() => expect(container.querySelector(".katex")).not.toBeNull());
    expect(hoisted.loads).toEqual({ math: 1, html: 0 });
  });

  it("出现 HTML 标签才加载 HTML chunk，加载前显示成文字，加载后渲染", async () => {
    const { container } = render(<MarkdownProse content={"按 <kbd>Esc</kbd> 退出"} />);
    await waitFor(() => expect(container.querySelector("kbd")).not.toBeNull());
    expect(hoisted.loads.html).toBe(1);
  });

  it("加载完成后只有需要它的块重渲染，其他块不动", async () => {
    // 把 chunk 状态重置成“没加载”，再挂载：公式块要等加载完成，期间别的块不应被通知。
    resetLazyPluginsForTests();
    hoisted.markdown.mockClear();
    const { container } = render(
      <MarkdownProse content={"无关的第一块\n\n无关的第二块\n\n无关的第三块\n\n公式 $a$ 第四块"} />,
    );
    expect(container.querySelector(".katex")).toBeNull();
    expect(container.textContent).toContain("$a$");
    await waitFor(() => expect(container.querySelector(".katex")).not.toBeNull());
    expect(countOf("无关的第一块")).toBe(1);
    expect(countOf("无关的第二块")).toBe(1);
    expect(countOf("无关的第三块")).toBe(1);
    expect(countOf("第四块")).toBe(2);
  });
});

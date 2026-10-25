import { render } from "@testing-library/react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { describe, expect, it, vi } from "vitest";
import { splitMarkdownBlocks, type MarkdownBlockSplit } from "../components/messages/markdown-blocks";
import { MarkdownProse } from "../components/messages/MarkdownProse";

vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: "<svg></svg>" })) } }));

const DOC = [
  "# 标题",
  "",
  "第一段，带 **加粗** 和 `code`。",
  "第一段续行。",
  "",
  "- 列表一",
  "- 列表二",
  "",
  "  列表里的段落",
  "",
  "| a | b |",
  "| - | - |",
  "| 1 | 2 |",
  "",
  "```ts",
  "const answer = 42;",
  "",
  "console.log(answer);",
  "```",
  "",
  "> 引用",
  "继续引用",
  "",
  "Setext 标题",
  "---",
  "",
  "最后一段 [链接](src/app.ts)。",
  "",
].join("\n");

function stream(content: string, step = 1): MarkdownBlockSplit[] {
  const splits: MarkdownBlockSplit[] = [];
  let previous: MarkdownBlockSplit | undefined;
  for (let end = step; end < content.length + step; end += step) {
    previous = splitMarkdownBlocks(content.slice(0, Math.min(end, content.length)), previous);
    splits.push(previous);
  }
  return splits;
}

describe("splitMarkdownBlocks", () => {
  it("slices blocks verbatim so they always join back into the content", () => {
    for (const split of stream(DOC)) {
      expect(split.blocks.map((block) => block.source).join("")).toBe(split.content);
      for (const block of split.blocks) expect(split.content.slice(block.start, block.start + block.source.length)).toBe(block.source);
    }
  });

  it("streams to the same blocks as a from-scratch split, for every prefix", () => {
    for (const split of stream(DOC)) {
      const fresh = splitMarkdownBlocks(split.content);
      expect(split.blocks.map((block) => [block.start, block.source])).toEqual(fresh.blocks.map((block) => [block.start, block.source]));
    }
  });

  it("keeps all but the last two blocks frozen and reuses their objects", () => {
    const first = splitMarkdownBlocks("一\n\n二\n\n三\n\n四");
    expect(first.blocks.map((block) => block.frozen)).toEqual([true, true, false, false]);
    const next = splitMarkdownBlocks("一\n\n二\n\n三\n\n四五", first);
    expect(next.blocks[0]).toBe(first.blocks[0]);
    expect(next.blocks[1]).toBe(first.blocks[1]);
    expect(next.blocks[2]).toBe(first.blocks[2]);
    expect(next.blocks[3]).not.toBe(first.blocks[3]);
    expect(splitMarkdownBlocks(next.content, next)).toBe(next);
  });

  it("re-splits from scratch when content is not an append", () => {
    const first = splitMarkdownBlocks("一\n\n二\n\n三\n\n四");
    const rewritten = splitMarkdownBlocks("甲\n\n二\n\n三\n\n四", first);
    expect(rewritten.blocks[0].source).toBe("甲");
    expect(rewritten.blocks.map((block) => block.source).join("")).toBe(rewritten.content);
  });

  it("falls back to one block when reference definitions or footnotes span blocks", () => {
    expect(splitMarkdownBlocks("见 [文档][doc]。\n\n[doc]: https://example.com").blocks).toHaveLength(1);
    expect(splitMarkdownBlocks("正文[^1]\n\n[^1]: 注释").blocks).toHaveLength(1);
    expect(splitMarkdownBlocks("").blocks).toEqual([]);
  });
});

describe("MarkdownProse block rendering", () => {
  const normalize = (html: string) => html.replace(/>\s+</g, "><").trim();

  it("renders the same structure as parsing the whole message at once", () => {
    const blocked = render(<MarkdownProse content={DOC} />).container.querySelector(".markdown-prose")!;
    const whole = render(<div><Markdown remarkPlugins={[remarkGfm]}>{DOC}</Markdown></div>).container.firstElementChild!;
    const tags = (root: Element) => Array.from(root.querySelectorAll("h1, h2, p, ul, li, table, td, blockquote, a")).map((node) => `${node.tagName}:${node.textContent}`);
    expect(tags(blocked)).toEqual(tags(whole));
    expect(normalize(blocked.innerHTML)).toContain("markdown-code-shell");
  });

  it("keeps earlier block DOM in place while the tail streams", () => {
    const { container, rerender } = render(<MarkdownProse content={"第一段\n\n第二段\n\n第三段"} />);
    const firstParagraph = container.querySelector("p");
    rerender(<MarkdownProse content={"第一段\n\n第二段\n\n第三段继续\n\n第四段"} />);
    expect(container.querySelector("p")).toBe(firstParagraph);
    expect(Array.from(container.querySelectorAll("p")).map((node) => node.textContent)).toEqual(["第一段", "第二段", "第三段继续", "第四段"]);
  });
});

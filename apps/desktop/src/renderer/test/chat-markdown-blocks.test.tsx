import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownProse } from "../components/messages/MarkdownProse";
import { splitMarkdownBlocks } from "../components/messages/markdown-blocks";
import { collectDefinitions, footnoteKeyFromHref } from "../components/messages/markdown/definitions";
import { mergeHtmlBlocks } from "../components/messages/markdown/merge-html-blocks";

/** 分块之后的两步：合并跨块 <details>（§8.1），收集全局定义（§8.2）。 */

const blocksOf = (content: string) => splitMarkdownBlocks(content).blocks;

describe("mergeHtmlBlocks（T22）", () => {
  const DETAILS = "<details>\n<summary>更多</summary>\n\n第一段\n\n第二段\n\n</details>\n\n后面的正文";

  it("没闭合的 <details> 把后面的块并进来，直到 </details>", () => {
    const blocks = blocksOf(DETAILS);
    expect(blocks.length).toBeGreaterThan(2);
    const merged = mergeHtmlBlocks(blocks);
    expect(merged).toHaveLength(2);
    expect(merged[0].source).toContain("<summary>更多</summary>");
    expect(merged[0].source).toContain("第二段");
    expect(merged[0].source).toContain("</details>");
    expect(merged[1].source.trim()).toBe("后面的正文");
  });

  it("流式中 </details> 还没到：一直并到末尾", () => {
    const merged = mergeHtmlBlocks(blocksOf("<details>\n<summary>x</summary>\n\n正文还在写"));
    expect(merged).toHaveLength(1);
  });

  it("嵌套的 <details> 要数到配平为止", () => {
    const merged = mergeHtmlBlocks(
      blocksOf(
        "<details>\n<summary>外</summary>\n\n<details>\n<summary>内</summary>\n\n里面\n\n</details>\n\n外层还有\n\n</details>\n\n尾",
      ),
    );
    expect(merged).toHaveLength(2);
    expect(merged[1].source.trim()).toBe("尾");
  });

  it("没有 <details> 时原样返回同一批对象", () => {
    const blocks = blocksOf("甲\n\n乙\n\n丙");
    expect(mergeHtmlBlocks(blocks)).toBe(blocks);
  });

  it("段落或代码里提到 <details> 不算：不会吞掉后面的块", () => {
    const blocks = blocksOf("用 <details> 标签可以折叠\n\n后面一段\n\n再后面");
    expect(mergeHtmlBlocks(blocks)).toBe(blocks);
    const fenced = blocksOf("```html\n<details>\n```\n\n后面一段");
    expect(mergeHtmlBlocks(fenced)).toBe(fenced);
  });

  it("内容没变的合并块沿用上一次的对象（让渲染层 memo 跳过它）", () => {
    const first = mergeHtmlBlocks(blocksOf(DETAILS));
    const again = mergeHtmlBlocks(blocksOf(DETAILS), first);
    expect(again[0]).toBe(first[0]);
    const grown = mergeHtmlBlocks(blocksOf(`${DETAILS}继续`), first);
    expect(grown[0]).toBe(first[0]);
    expect(grown[1]).not.toBe(first[1]);
  });
});

describe("collectDefinitions（T22）", () => {
  it("引用式定义和脚注都不再让整条回复退回一块", () => {
    const content = "见 [文档][doc]。\n\n中间一段\n\n再引用[^a]\n\n[doc]: https://example.com\n\n[^a]: 注释";
    const blocks = blocksOf(content);
    expect(blocks.length).toBeGreaterThanOrEqual(5);
    const index = collectDefinitions(blocks);
    expect(index.blockDefs).toHaveLength(blocks.length);
    expect(index.blockDefs[0]).toContain("[doc]: https://example.com");
    expect(index.blockDefs[1]).toBe("");
    expect(index.blockDefs[2]).toBe("[^a]: .");
    // 定义块自己不再追加定义
    expect(index.blockDefs[blocks.length - 1]).toBe("");
  });

  it("脚注编号按全文第一次被引用的顺序，不按定义的顺序", () => {
    const blocks = blocksOf("先用[^b]\n\n再用[^a]\n\n[^a]: 甲\n\n[^b]: 乙");
    const index = collectDefinitions(blocks);
    expect([...index.footnoteNumbers.entries()]).toEqual([
      ["b", 1],
      ["a", 2],
    ]);
    expect(index.footnotes?.labels).toEqual(["b", "a"]);
  });

  it("引用了没有定义的脚注或标签：不追加、不编号", () => {
    const index = collectDefinitions(blocksOf("悬空[^x] 和 [nowhere]\n\n[doc]: https://example.com"));
    expect(index.blockDefs[0]).toBe("");
    expect(index.footnotes).toBeNull();
    expect(index.footnoteNumbers.size).toBe(0);
  });

  it("围栏代码块和行内代码里的 [^x]、[label] 不算引用", () => {
    const index = collectDefinitions(
      blocksOf("```\n[^a] [doc]\n```\n\n行内 `[^a]` 和 `[doc]`\n\n[doc]: https://example.com\n\n[^a]: 注释"),
    );
    expect(index.blockDefs.every((defs) => defs === "")).toBe(true);
    expect(index.footnotes).toBeNull();
  });

  it("引用标签忽略大小写和空白差异", () => {
    const index = collectDefinitions(blocksOf("见 [My  Doc]\n\n[my doc]: https://example.com"));
    expect(index.blockDefs[0]).toContain("https://example.com");
  });

  it("没有任何定义时，不追加", () => {
    expect(collectDefinitions(blocksOf("普通\n\n文字")).blockDefs.every((defs) => defs === "")).toBe(true);
    expect(collectDefinitions([]).footnotes).toBeNull();
  });

  it("footnoteKeyFromHref 只认本回复前缀下的脚注引用", () => {
    expect(footnoteKeyFromHref("#user-content-r1-fn-A", "user-content-r1-")).toBe("a");
    expect(footnoteKeyFromHref("#user-content-r2-fn-a", "user-content-r1-")).toBeNull();
    expect(footnoteKeyFromHref("https://example.com", "user-content-r1-")).toBeNull();
    expect(footnoteKeyFromHref(undefined, "p-")).toBeNull();
  });
});

describe("脚注和引用式链接的渲染（T22）", () => {
  const CONTENT =
    "先说 A[^b]，再说 B[^a]，还有 [文档][doc]。\n\n中间一段\n\n又提到 B[^a]\n\n[doc]: https://example.com/doc\n\n[^a]: 甲的注释\n\n[^b]: 乙的注释";

  it("整条回复只有一个脚注区，放在最后，定义块不单独显示", () => {
    const { container } = render(<MarkdownProse content={CONTENT} />);
    const sections = container.querySelectorAll("section[data-footnotes]");
    expect(sections).toHaveLength(1);
    expect(container.querySelector(".markdown-prose")?.lastElementChild).toBe(sections[0]);
    expect(container.textContent).not.toContain("[^a]:");
    expect(container.textContent).not.toContain("[doc]:");
  });

  it("脚注按首次引用的顺序编号，引用处显示同一个编号", () => {
    const { container } = render(<MarkdownProse content={CONTENT} />);
    const section = container.querySelector<HTMLElement>("section[data-footnotes]")!;
    const items = within(section).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("乙的注释"),
      expect.stringContaining("甲的注释"),
    ]);
    const refs = Array.from(container.querySelectorAll<HTMLAnchorElement>("a")).filter((a) =>
      a.getAttribute("href")?.includes("-fn-"),
    );
    expect(refs.map((a) => a.textContent)).toEqual(["1", "2", "2"]);
  });

  it("引用式链接跨块解析成真实链接，不显示原文", () => {
    const { container } = render(<MarkdownProse content={CONTENT} />);
    const link = Array.from(container.querySelectorAll("a")).find((a) => a.textContent === "文档");
    expect(link).toHaveAttribute("href", "https://example.com/doc");
    expect(container.textContent).not.toContain("[文档][doc]");
  });

  it("脚注 id 带本回复的前缀，两条回复不会串跳", () => {
    const { container } = render(
      <>
        <MarkdownProse content={CONTENT} />
        <MarkdownProse content={CONTENT} />
      </>,
    );
    const [one, two] = Array.from(container.querySelectorAll("section[data-footnotes]"));
    const ids = (root: Element) => Array.from(root.querySelectorAll("[id]")).map((node) => node.id);
    expect(ids(one).length).toBeGreaterThan(0);
    expect(ids(one).filter((id) => ids(two).includes(id))).toEqual([]);
  });
});

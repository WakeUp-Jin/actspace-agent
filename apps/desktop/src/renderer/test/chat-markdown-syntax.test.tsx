import { render, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { MarkdownProse } from "../components/messages/MarkdownProse";
import { parseCodeTitle } from "../components/messages/markdown/remark-code-meta";
import { isValidInlineMath } from "../components/messages/markdown/remark-math-guard";

/** 聊天区 Markdown 的语法层：提示框、围栏 meta、公式守卫、原始 HTML 清理、高亮（规范 §5.2–§5.6）。 */

function reply(content: string, host?: (path: string, line?: number) => void) {
  const view = render(<MarkdownProse content={content} onOpenWorkspaceFile={host} />);
  return { ...view, root: view.container.querySelector<HTMLElement>(".markdown-prose")! };
}

describe("提示框（T20）", () => {
  const TYPES = [
    ["NOTE", "说明", "md-callout-note"],
    ["TIP", "提示", "md-callout-tip"],
    ["IMPORTANT", "重要", "md-callout-important"],
    ["WARNING", "注意", "md-callout-warning"],
    ["CAUTION", "警告", "md-callout-caution"],
  ] as const;

  it.each(TYPES)("%s 渲染成带类名和标签属性的提示框，标签不进 DOM 文本", (type, label, className) => {
    const { root } = reply(`> [!${type}]\n> 正文内容`);
    const box = root.querySelector("blockquote")!;
    expect(box).toHaveClass("md-callout", className);
    expect(box).toHaveAttribute("data-callout-label", label);
    expect(box.textContent).toContain("正文内容");
    expect(box.textContent).not.toContain(label);
    expect(box.textContent).not.toContain("[!");
  });

  it("首行只有标签时，正文来自后面的行", () => {
    const { root } = reply("> [!NOTE]\n>\n> 第二段");
    const box = root.querySelector("blockquote.md-callout")!;
    expect(box.textContent?.trim()).toBe("第二段");
  });

  it("标签后面紧跟正文（同一行）也能识别", () => {
    const { root } = reply("> [!WARNING] 小心这里");
    const box = root.querySelector("blockquote.md-callout-warning")!;
    expect(box.textContent?.trim()).toBe("小心这里");
  });

  it("普通引用不受影响", () => {
    const { root } = reply("> 就是一句引用");
    const box = root.querySelector("blockquote");
    expect(box).not.toHaveClass("md-callout");
    expect(box).not.toHaveAttribute("data-callout-label");
  });
});

describe("围栏 title= 解析（T20）", () => {
  it.each([
    ['title="src/a b.ts"', "src/a b.ts"],
    ["title='src/a.ts'", "src/a.ts"],
    ["title=src/a.ts", "src/a.ts"],
    ['{1,3} title="x.ts" other', "x.ts"],
    ['title=""', undefined],
    ["", undefined],
    ["nothing here", undefined],
  ])("meta %j → %j", (meta, expected) => {
    expect(parseCodeTitle(meta)).toBe(expected);
  });
});

describe("公式守卫（T21）", () => {
  // 先把数学 chunk 加载好：没加载时公式也显示原文，断言“保持文字”才有意义。
  beforeAll(async () => {
    const { root, unmount } = reply("预热 $x$");
    await waitFor(() => expect(root.querySelector(".katex")).not.toBeNull());
    unmount();
  });

  it.each([
    ["$x$", undefined, true],
    ["$x^2$", "。", true],
    ["$ x$", undefined, false],
    ["$x $", undefined, false],
    ["$x$", "5", false],
    ["$$", undefined, false],
  ])("isValidInlineMath(%j, %j) = %s", (raw, next, expected) => {
    expect(isValidInlineMath(raw, next)).toBe(expected);
  });

  it("合格的行内公式和块公式用 KaTeX 渲染，并整体排除在批注文本之外", async () => {
    const { root } = reply("行内 $a^2+b^2$ 公式\n\n$$\n\\frac{1}{2}\n$$");
    await waitFor(() => expect(root.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2));
    expect(root.querySelector(".katex-display")).not.toBeNull();
    for (const outer of Array.from(root.querySelectorAll("[data-annotation-exclude]"))) {
      expect(outer.className).toMatch(/katex/);
    }
    expect(root.querySelectorAll("[data-annotation-exclude]").length).toBeGreaterThanOrEqual(2);
  });

  it.each([
    ["价格 $5 和 $10 都不贵", "价格 $5 和 $10 都不贵"],
    ["转义 \\$x\\$ 不是公式", "转义 $x$ 不是公式"],
    ["空格 $ x$ 不算", "空格 $ x$ 不算"],
    ["空格 $x $ 不算", "空格 $x $ 不算"],
    ["紧跟数字 $x$5 不算", "紧跟数字 $x$5 不算"],
  ])("不合格的写法保持文字：%s", async (source, text) => {
    const { root } = reply(source);
    expect(root.textContent).toBe(text);
    expect(root.querySelector(".katex")).toBeNull();
  });

  it("还原成文字时保留里面的加粗", async () => {
    const { root } = reply("$5 **很贵** 和 $10");
    expect(root.querySelector("strong")?.textContent).toBe("很贵");
    expect(root.querySelector(".katex")).toBeNull();
  });

  it("写错的公式显示原文并带 katex-error，不抛错", async () => {
    const { root } = reply("坏公式 $\\notacommand{$ 结束");
    await waitFor(() => expect(root.querySelector(".katex-error")).not.toBeNull());
    expect(root.querySelector("[data-annotation-exclude]")).not.toBeNull();
  });
});

describe("原始 HTML 清理（T22）", () => {
  it("白名单元素被渲染：details、summary、kbd、br", async () => {
    const { root } = reply("<details><summary>更多</summary>\n\n内容\n\n</details>\n\n按 <kbd>Ctrl</kbd> 键<br>换行");
    await waitFor(() => expect(root.querySelector("details")).not.toBeNull());
    expect(root.querySelector("summary")?.textContent).toBe("更多");
    expect(root.querySelector("kbd")?.textContent).toBe("Ctrl");
    expect(root.querySelector("br")).not.toBeNull();
  });

  it("script、iframe、style 元素被整个去掉", async () => {
    const { root } = reply(
      '正文 <kbd>k</kbd>\n\n<script>window.hacked = 1</script>\n\n<iframe src="https://evil.test"></iframe>\n\n<style>p{display:none}</style>',
    );
    await waitFor(() => expect(root.querySelector("kbd")).not.toBeNull());
    expect(root.querySelector("script, iframe, style")).toBeNull();
    expect(root.textContent).not.toContain("hacked");
    expect((window as unknown as { hacked?: number }).hacked).toBeUndefined();
  });

  it("事件属性和 style 属性被去掉", async () => {
    const { root } = reply('<kbd onclick="alert(1)" style="color:red" onmouseover="x()">k</kbd>');
    await waitFor(() => expect(root.querySelector("kbd")).not.toBeNull());
    const kbd = root.querySelector("kbd")!;
    expect(kbd.getAttributeNames().filter((name) => name.startsWith("on") || name === "style")).toEqual([]);
  });

  it("javascript: 协议的链接没有 href", async () => {
    const { root } = reply('<a href="javascript:alert(1)">点我</a> <kbd>k</kbd>');
    await waitFor(() => expect(root.querySelector("kbd")).not.toBeNull());
    const hrefs = Array.from(root.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.every((href) => !href.toLowerCase().startsWith("javascript:"))).toBe(true);
  });

  it("原始 HTML 里的远程 <img> 不加载：没有 img 元素，显示占位", async () => {
    const { root } = reply('<img src="https://tracker.test/p.png" alt="追踪图"> <kbd>k</kbd>');
    await waitFor(() => expect(root.querySelector("kbd")).not.toBeNull());
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain("图片：追踪图（远程地址，不加载）");
  });

  it("回复自己写的 data-path / data-line 不会变成可点的路径", async () => {
    const calls: string[] = [];
    const { root } = reply('<code data-path="etc/passwd" data-line="3" class="md-path">x</code> <kbd>k</kbd>', (path) =>
      calls.push(path),
    );
    await waitFor(() => expect(root.querySelector("kbd")).not.toBeNull());
    const code = root.querySelector("code");
    expect(code?.getAttribute("data-path")).toBeNull();
    code?.click();
    expect(calls).toEqual([]);
  });
});

describe("代码高亮（T24）", () => {
  it("标了语言的围栏按语言高亮", () => {
    const { root } = reply("```ts\nconst answer: number = 42;\n```");
    expect(root.querySelector("pre code .hljs-keyword")).not.toBeNull();
  });

  it("没标语言的围栏不自动识别：纯文本，标签写「文本」", () => {
    const { root } = reply("```\nError: cannot find module 'x'\n    at foo (a.js:1:1)\n```");
    expect(root.querySelector("pre code [class^='hljs-']")).toBeNull();
    expect(root.querySelector(".md-code-lang")?.textContent).toBe("文本");
  });
});

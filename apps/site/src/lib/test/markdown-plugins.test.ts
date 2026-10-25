import { satteri } from "@astrojs/markdown-satteri";
import { describe, expect, it } from "vitest";
import { spaceCjk, spaceHastTree } from "../markdown/cjk-spacing.mjs";
import { proseCjkSpacing, proseStructure } from "../markdown/prose-plugins.mjs";
import { actspacePaperTheme } from "../markdown/shiki-theme.mjs";

async function render(markdown: string, fileURL?: URL) {
  const renderer = await satteri({ hastPlugins: [proseStructure(), proseCjkSpacing()] }).createRenderer({
    syntaxHighlight: "shiki",
    shikiConfig: { theme: actspacePaperTheme },
  });
  return renderer.render(markdown, { fileURL });
}

describe("CJK spacing", () => {
  it("spaces CJK next to Latin letters and digits, leaving punctuation alone", () => {
    expect(spaceCjk("用Bash工具跑了3次")).toBe("用 Bash 工具跑了 3 次");
    expect(spaceCjk("占50%的上下文")).toBe("占 50% 的上下文");
    expect(spaceCjk("已经有空格 Bash 工具，没问题。")).toBe("已经有空格 Bash 工具，没问题。");
  });

  it("spaces across inline element boundaries without touching code", () => {
    const tree = {
      type: "root",
      children: [
        { type: "text", value: "调用" },
        { type: "element", tagName: "code", properties: {}, children: [{ type: "text", value: "a中b" }] },
        { type: "text", value: "工具" },
      ],
    };
    spaceHastTree(tree);
    expect(tree.children.map((node) => ("value" in node ? node.value : node.children[0].value))).toEqual(["调用 ", "a中b", " 工具"]);
  });
});

describe("prose structure plugins", () => {
  it("turns image-only paragraphs into figures and emoji paragraphs into callouts", async () => {
    const { code } = await render("![流程图](https://example.com/a.png)\n\n💡 记得**保存**\n\n- 💡 列表里不转\n");
    expect(code).toContain('<figure><img src="https://example.com/a.png" alt="流程图"><figcaption>流程图</figcaption></figure>');
    expect(code).toContain('<div class="callout"><span class="ico" aria-hidden="true">💡</span><div>记得<strong>保存</strong></div></div>');
    expect(code).toContain("<li>💡 列表里不转</li>");
  });

  it("spaces blog headings but leaves docs headings (and their anchor slugs) untouched", async () => {
    const blog = await render("## Agent设计\n", new URL("file:///site/src/content/blog/a.md"));
    expect(blog.code).toContain(">Agent 设计</h2>");
    const docs = await render("## Agent设计\n", new URL("file:///site/src/content/docs/a.md"));
    expect(docs.code).toContain(">Agent设计</h2>");
  });

  it("splits manual heading numbers but keeps heading text and slugs", async () => {
    const { code, metadata } = await render("## 2、Agent设计\n\n## 产品理念\n", new URL("file:///site/src/content/docs/a.md"));
    expect(code).toContain('<span class="hn">2<span class="hn-sep">、</span></span><span class="ht">Agent设计</span>');
    expect(metadata.headings.map((heading) => [heading.slug, heading.text])).toEqual([
      ["2agent设计", "2、Agent设计"],
      ["产品理念", "产品理念"],
    ]);
  });

  it("drops empty paragraphs inside blockquotes", async () => {
    const { code } = await render("> 第一段\n>\n> &nbsp;\n>\n> 第二段\n");
    expect(code.match(/<p>/g)).toHaveLength(2);
  });

  it("wraps highlighted code in a card with language, line count, hidden copy button and gutter", async () => {
    const { code } = await render("```ts\nconst a = 1;\nconst b = 2;\n```\n\n文字`code`文字\n");
    expect(code).toContain('<div class="code" data-lang="ts"><div class="code-bar"><span class="code-lang">TypeScript</span><span class="code-lines">2 行</span>');
    expect(code).toContain('<button type="button" class="code-copy" aria-label="复制代码" hidden>复制</button>');
    expect(code).toContain('<div class="code-gutter" aria-hidden="true">1\n2</div><pre class="astro-code actspace-paper"');
    expect(code).not.toMatch(/<pre[^>]*style=/);
    expect(code).toContain("const</span>");
    expect(code).toContain("文字 <code>code</code> 文字");
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownPreviewBody } from "../components/right-panel/MarkdownRenderView";
import { LANGUAGE_MODULES } from "../components/right-panel/highlight";
import { resetMermaidRendererForTests } from "../components/messages/mermaid-renderer";

vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render: vi.fn() } }));

async function mermaidRender() {
  return ((await import("mermaid")).default as unknown as { render: ReturnType<typeof vi.fn> }).render;
}

const FLOW = "flowchart TD\n  A --> B";

beforeEach(async () => {
  resetMermaidRendererForTests();
  const renderMock = await mermaidRender();
  renderMock.mockReset();
  renderMock.mockImplementation(async (id: string) => ({ svg: `<svg id="${id}" viewBox="0 0 100 50" width="100" height="50" role="graphics-document"></svg>`, diagramType: "flowchart-v2" }));
});

const SAMPLE = [
  "# 标题",
  "",
  "| 名称 | 值 |",
  "| --- | --- |",
  "| a | 1 |",
  "",
  "- [x] 完成项",
  "- [ ] 待办项",
  "",
  "```js",
  "const x = 1;",
  "```",
  "",
  "[链接](https://example.com)",
  "",
  "<script>alert('xss')</script>",
].join("\n");

describe("MarkdownPreviewBody 高亮注册表", () => {
  it("fence 语言集覆盖文件视图那一套", () => {
    for (const language of ["shell", "bash", "typescript", "dockerfile", "yaml", "json"]) {
      expect(LANGUAGE_MODULES).toHaveProperty(language);
    }
  });

  it("common 之外的语言也能在 fence 里着色", async () => {
    const { container } = render(<MarkdownPreviewBody source={"```dockerfile\nFROM node:22\n```"} />);
    // dockerfile 不在 lowlight 的 common 里：能着色说明 languages 替换生效了。
    await waitFor(() => expect(container.querySelector(".hljs-keyword")).not.toBeNull());
    expect(container.querySelector(".hljs-keyword")?.textContent).toBe("FROM");
  });

  it("未注册语言的 fence 不报错，按纯文本落地", async () => {
    const { container } = render(<MarkdownPreviewBody source={"```no-such-lang\nplain body\n```"} />);
    // ignoreMissing: true，所以缺语言只是不着色，不该抛。
    await waitFor(() => expect(container.querySelector("code")).not.toBeNull());
    expect(container.textContent).toContain("plain body");
  });
});

describe("MarkdownPreviewBody", () => {
  it("renders GFM tables, task lists, highlighted code and safe links", () => {
    const { container } = render(<MarkdownPreviewBody source={SAMPLE} />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1" })).toBeInTheDocument();
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(2);

    const code = container.querySelector("pre code");
    expect(code?.className).toContain("hljs");

    const link = screen.getByRole("link", { name: "链接" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("does not render raw HTML as live elements (no rehype-raw)", () => {
    const { container } = render(<MarkdownPreviewBody source={SAMPLE} />);
    // 原始 <script> 被转义为文本，不应作为真实 DOM 节点存在。
    expect(container.querySelector("script")).toBeNull();
  });

  it("renders a closed mermaid fence as a diagram and keeps other fences as code", async () => {
    const { container } = render(<MarkdownPreviewBody source={`介绍\n\n\`\`\`mermaid\n${FLOW}\n\`\`\`\n\n\`\`\`js\nconst x = 1;\n\`\`\``} />);
    expect(await screen.findByRole("img", { name: /Mermaid 图表/ })).toBeInTheDocument();
    expect((await mermaidRender()).mock.calls[0][1]).toBe(FLOW);
    expect(container.querySelector("pre code.language-js")).not.toBeNull();
  });

  it("keeps an unclosed mermaid fence as code instead of rendering it", async () => {
    const { container } = render(<MarkdownPreviewBody source={`\`\`\`mermaid\n${FLOW}`} />);
    await waitFor(() => expect(container.querySelector("pre code")).not.toBeNull());
    expect(screen.queryByRole("img", { name: /Mermaid 图表/ })).toBeNull();
    expect(await mermaidRender()).not.toHaveBeenCalled();
  });

  it("splits a long document into top-level blocks and re-renders only the changed one", () => {
    const paragraphs = Array.from({ length: 6 }, (_, index) => `第 ${index} 段`).join("\n\n");
    const { container, rerender } = render(<MarkdownPreviewBody source={paragraphs} />);
    const before = Array.from(container.querySelectorAll("p"));
    expect(before).toHaveLength(6);
    rerender(<MarkdownPreviewBody source={`${paragraphs}\n\n第 6 段`} />);
    const after = Array.from(container.querySelectorAll("p"));
    expect(after).toHaveLength(7);
    // 冻结块的 DOM 节点原样保留。
    expect(after[0]).toBe(before[0]);
  });
});

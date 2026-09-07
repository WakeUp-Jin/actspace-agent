import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MarkdownRenderView } from "../components/right-panel/MarkdownRenderView";
import { LANGUAGE_MODULES } from "../components/right-panel/highlight";

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

describe("MarkdownRenderView 高亮注册表", () => {
  it("fence 语言集覆盖文件视图那一套", () => {
    for (const language of ["shell", "bash", "typescript", "dockerfile", "yaml", "json"]) {
      expect(LANGUAGE_MODULES).toHaveProperty(language);
    }
  });

  it("common 之外的语言也能在 fence 里着色", async () => {
    const { container } = render(<MarkdownRenderView source={"```dockerfile\nFROM node:22\n```"} />);
    // dockerfile 不在 lowlight 的 common 里：能着色说明 languages 替换生效了。
    await waitFor(() => expect(container.querySelector(".hljs-keyword")).not.toBeNull());
    expect(container.querySelector(".hljs-keyword")?.textContent).toBe("FROM");
  });

  it("未注册语言的 fence 不报错，按纯文本落地", async () => {
    const { container } = render(<MarkdownRenderView source={"```no-such-lang\nplain body\n```"} />);
    // ignoreMissing: true，所以缺语言只是不着色，不该抛。
    await waitFor(() => expect(container.querySelector("code")).not.toBeNull());
    expect(container.textContent).toContain("plain body");
  });
});

describe("MarkdownRenderView", () => {
  it("renders GFM tables, task lists, highlighted code and safe links", () => {
    const { container } = render(<MarkdownRenderView source={SAMPLE} />);

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
    const { container } = render(<MarkdownRenderView source={SAMPLE} />);
    // 原始 <script> 被转义为文本，不应作为真实 DOM 节点存在。
    expect(container.querySelector("script")).toBeNull();
  });

  it("toggles to the source view showing raw markdown", async () => {
    const user = userEvent.setup();
    render(<MarkdownRenderView source={"# 仅源码"} />);

    await user.click(screen.getByRole("tab", { name: "源码" }));
    expect(screen.getByText("# 仅源码")).toBeInTheDocument();
  });
});

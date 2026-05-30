import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MarkdownRenderView } from "../components/right-panel/MarkdownRenderView";

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

describe("MarkdownRenderView", () => {
  it("renders GFM tables, task lists, highlighted code and safe links", () => {
    const { container } = render(<MarkdownRenderView source={SAMPLE} relativePath="docs/demo.md" />);

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
    const { container } = render(<MarkdownRenderView source={SAMPLE} relativePath="docs/demo.md" />);
    // 原始 <script> 被转义为文本，不应作为真实 DOM 节点存在。
    expect(container.querySelector("script")).toBeNull();
  });

  it("toggles to the source view showing raw markdown", async () => {
    const user = userEvent.setup();
    render(<MarkdownRenderView source={"# 仅源码"} relativePath="docs/demo.md" />);

    await user.click(screen.getByRole("tab", { name: "源码" }));
    expect(screen.getByText("# 仅源码")).toBeInTheDocument();
  });
});

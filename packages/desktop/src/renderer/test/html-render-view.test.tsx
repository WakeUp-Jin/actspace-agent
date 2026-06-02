import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { HtmlRenderView } from "../components/right-panel/HtmlRenderView";

/**
 * HTML 沙箱渲染视图的静态安全探针（见 front-右侧面板与文件渲染规范.md 验收）：
 * - sandbox 只给 allow-scripts，绝不出现 allow-same-origin；
 * - srcDoc 注入 CSP：chat→relaxed（connect-src 'none'）、file→strict（default-src 'none' 且无 https）；
 * - 源码视图展示原始 HTML。
 */
function getIframe(container: HTMLElement): HTMLIFrameElement {
  const iframe = container.querySelector("iframe");
  if (!iframe) {
    throw new Error("iframe not found");
  }
  return iframe;
}

describe("HtmlRenderView", () => {
  it("renders a sandboxed iframe without allow-same-origin", () => {
    const { container } = render(<HtmlRenderView html="<p>hello</p>" trust="chat" />);
    const iframe = getIframe(container);

    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe.getAttribute("sandbox")).not.toContain("allow-same-origin");
  });

  it("injects the relaxed CSP for chat HTML and blocks data exfiltration", () => {
    const { container } = render(<HtmlRenderView html="<p>chat</p>" trust="chat" />);
    const srcDoc = getIframe(container).getAttribute("srcdoc") ?? "";

    expect(srcDoc).toContain("Content-Security-Policy");
    expect(srcDoc).toContain("connect-src 'none'");
    expect(srcDoc).not.toContain("allow-same-origin");
  });

  it("injects the strict CSP for local file HTML (no external resources)", () => {
    const { container } = render(<HtmlRenderView html="<p>file</p>" trust="file" relativePath="docs/demo.html" />);
    const srcDoc = getIframe(container).getAttribute("srcdoc") ?? "";

    expect(srcDoc).toContain("default-src 'none'");
    // strict 档不放行 https 静态资源。
    expect(srcDoc).not.toContain("img-src https:");
  });

  it("shows the raw HTML in the source view", async () => {
    const user = userEvent.setup();
    render(<HtmlRenderView html="<section>raw markup</section>" trust="chat" />);

    await user.click(screen.getByRole("tab", { name: "源码" }));
    expect(screen.getByText("<section>raw markup</section>")).toBeInTheDocument();
  });
});

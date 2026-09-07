import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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

const OriginalResizeObserver = globalThis.ResizeObserver;

afterEach(() => {
  globalThis.ResizeObserver = OriginalResizeObserver;
  vi.restoreAllMocks();
});

function installResizeObserver() {
  let callback: ResizeObserverCallback | null = null;
  globalThis.ResizeObserver = vi.fn((nextCallback: ResizeObserverCallback) => {
    callback = nextCallback;
    return {
      disconnect: vi.fn(),
      observe: vi.fn(),
      unobserve: vi.fn(),
    };
  }) as unknown as typeof ResizeObserver;

  return (width: number) => {
    act(() => {
      callback?.(
        [{ contentRect: { width } } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    });
  };
}

function publishLayout(
  iframe: HTMLIFrameElement,
  layout: { width: number; height: number; viewportWidth: number },
) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", {
      source: iframe.contentWindow,
      data: { __actspacePreview: true, type: "layout", ...layout },
    }));
  });
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

  it("fits a fixed-width canvas to the preview viewport and follows viewport resizes", () => {
    const publishResize = installResizeObserver();
    const { container } = render(<HtmlRenderView html="<main>canvas</main>" trust="file" />);
    const iframe = getIframe(container);
    const canvas = container.querySelector<HTMLElement>("[data-html-preview-canvas]");

    expect(canvas).not.toBeNull();
    publishResize(800);
    publishLayout(iframe, { width: 1600, height: 1000, viewportWidth: 800 });

    expect(iframe.style.width).toBe("1600px");
    expect(iframe.style.transform).toBe("scale(0.5)");
    expect(canvas?.style.width).toBe("800px");
    expect(canvas?.style.height).toBe("500px");

    publishResize(600);

    expect(iframe.style.transform).toBe("scale(0.375)");
    expect(canvas?.style.width).toBe("600px");
    expect(canvas?.style.height).toBe("375px");
  });

  it("keeps responsive documents at the native preview width", () => {
    const publishResize = installResizeObserver();
    const { container } = render(<HtmlRenderView html="<main>responsive</main>" trust="file" />);
    const iframe = getIframe(container);
    const canvas = container.querySelector<HTMLElement>("[data-html-preview-canvas]");

    publishResize(800);
    publishLayout(iframe, { width: 800, height: 1200, viewportWidth: 800 });

    expect(iframe.style.width).toBe("100%");
    expect(iframe.style.transform).toBe("");
    expect(canvas?.style.width).toBe("100%");
    expect(canvas?.style.height).toBe("1200px");
  });
});

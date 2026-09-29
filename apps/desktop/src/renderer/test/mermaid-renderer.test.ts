import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MERMAID_MAX_SOURCE_CHARS,
  MermaidRenderError,
  instantiateMermaidSvg,
  isFenceClosed,
  isMermaidLanguage,
  peekMermaidCache,
  prepareMermaidSource,
  renderMermaid,
  resetMermaidRendererForTests,
  sanitizeMermaidSvg,
  svgIntrinsicSize,
} from "../components/messages/mermaid-renderer";

vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render: vi.fn() } }));

async function mermaidMock() {
  return (await import("mermaid")).default as unknown as {
    initialize: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
  };
}

function svgFor(id: string) {
  return `<svg id="${id}" viewBox="0 0 320 180" width="320"><style>#${id} .node rect{fill:#ffe7d9}</style><defs><marker id="${id}_arrow"><path d="M0,0 L5,5"/></marker></defs><g class="node"><rect/><text>A</text></g><path marker-end="url(#${id}_arrow)"/></svg>`;
}

beforeEach(async () => {
  resetMermaidRendererForTests();
  const mermaid = await mermaidMock();
  mermaid.initialize.mockReset();
  mermaid.render.mockReset();
  mermaid.render.mockImplementation(async (id: string) => ({ svg: svgFor(id), diagramType: "flowchart-v2" }));
});

describe("fence detection", () => {
  it("matches only the complete mermaid language, ignoring case and surrounding space", () => {
    expect(isMermaidLanguage("mermaid")).toBe(true);
    expect(isMermaidLanguage("MERMAID")).toBe(true);
    expect(isMermaidLanguage(" Mermaid ")).toBe(true);
    expect(isMermaidLanguage("mer")).toBe(false);
    expect(isMermaidLanguage("mermaidjs")).toBe(false);
    expect(isMermaidLanguage(undefined)).toBe(false);
  });

  it("treats a fence as closed only when its closing marker is present", () => {
    expect(isFenceClosed("```mermaid\ngraph TD\nA-->B\n```")).toBe(true);
    expect(isFenceClosed("```mermaid\ngraph TD\nA-->B\n```\n")).toBe(true);
    expect(isFenceClosed("~~~mermaid\ngraph TD\n~~~")).toBe(true);
    expect(isFenceClosed("> ```mermaid\n> graph TD\n> ```")).toBe(true);
    expect(isFenceClosed("```mermaid\ngraph TD\nA-->")).toBe(false);
    expect(isFenceClosed("```mermaid")).toBe(false);
    expect(isFenceClosed("````mermaid\ngraph TD\n```")).toBe(false);
    expect(isFenceClosed("```mermaid\ngraph TD\n~~~")).toBe(false);
  });
});

describe("prepareMermaidSource", () => {
  it("drops init directives, frontmatter config and interaction statements", () => {
    const source = [
      "---",
      "title: Flow",
      "config:",
      "  securityLevel: loose",
      "  theme: dark",
      "---",
      "%%{init: {\"securityLevel\": \"loose\", \"theme\": \"forest\"}}%%",
      "flowchart TD",
      "  A[Start] --> B{Ok?}",
      "  click A \"https://example.com\" _blank",
      "  CLICK B callback",
      "  B --> C",
    ].join("\n");
    const prepared = prepareMermaidSource(source);
    expect(prepared).toContain("title: Flow");
    expect(prepared).toContain("A[Start] --> B{Ok?}");
    expect(prepared).toContain("B --> C");
    expect(prepared).not.toMatch(/securityLevel|theme|forest|click|example\.com|callback|config:/i);
  });

  it("keeps ordinary diagrams unchanged", () => {
    expect(prepareMermaidSource("sequenceDiagram\n  A->>B: hi\n")).toBe("sequenceDiagram\n  A->>B: hi");
  });
});

describe("sanitizeMermaidSvg", () => {
  it("removes scripts, event handlers and external links but keeps styles and internal references", async () => {
    const dirty = `<svg id="x" viewBox="0 0 10 10"><style>#x .node{fill:red}</style><script>alert(1)</script><defs><marker id="m"/></defs><g onclick="alert(2)"><a href="https://evil.example"><text>link</text></a><image href="https://evil.example/p.png"/><path marker-end="url(#m)"/><use href="#m"/></g></svg>`;
    const clean = await sanitizeMermaidSvg(dirty);
    expect(clean).toMatch(/^<svg/);
    expect(clean).toContain("<style>");
    expect(clean).toContain("<marker");
    expect(clean).toContain("url(#m)");
    expect(clean).toContain('href="#m"');
    expect(clean).toContain("link");
    expect(clean).not.toMatch(/<script|alert|onclick|evil\.example|<a[\s>]/);
  });

  it("rejects output that is not an SVG", async () => {
    await expect(sanitizeMermaidSvg("<div>nope</div>")).rejects.toBeInstanceOf(MermaidRenderError);
  });

  it("reads the intrinsic size from the viewBox", () => {
    expect(svgIntrinsicSize('<svg viewBox="-8 -8 640.5 320">')).toEqual({ width: 640.5, height: 320 });
    expect(svgIntrinsicSize('<svg width="120" height="60">')).toEqual({ width: 120, height: 60 });
  });
});

describe("renderMermaid", () => {
  it("initializes Mermaid once with the fixed strict configuration", async () => {
    const mermaid = await mermaidMock();
    await renderMermaid("graph TD\nA-->B", "codex");
    await renderMermaid("graph TD\nB-->C", "codex");

    expect(mermaid.initialize).toHaveBeenCalledTimes(1);
    const config = mermaid.initialize.mock.calls[0][0];
    expect(config).toMatchObject({ startOnLoad: false, securityLevel: "strict", htmlLabels: false, theme: "base", suppressErrorRendering: true });
    expect(config.secure).toEqual(expect.arrayContaining(["securityLevel", "theme", "themeVariables", "themeCSS", "htmlLabels"]));
    expect(config.themeVariables.primaryColor).toBe("#ffe7d9");
  });

  it("renders the prepared source with a unique id and caches the sanitized result", async () => {
    const mermaid = await mermaidMock();
    const first = await renderMermaid("graph TD\nA-->B\nclick A href", "codex");
    const again = await renderMermaid("graph TD\nA-->B\nclick A href", "codex");
    const other = await renderMermaid("graph LR\nA-->B", "codex");

    expect(mermaid.render).toHaveBeenCalledTimes(2);
    expect(mermaid.render.mock.calls[0][1]).toBe("graph TD\nA-->B");
    expect(again).toBe(first);
    expect(peekMermaidCache("graph TD\nA-->B\nclick A href", "codex")).toBe(first);
    expect(first.renderId).not.toBe(other.renderId);
    expect(first).toMatchObject({ diagramType: "flowchart-v2", width: 320, height: 180 });
  });

  it("gives each mounted copy of a cached diagram its own ids", async () => {
    const result = await renderMermaid("graph TD\nA-->B", "codex");
    const copyA = instantiateMermaidSvg(result, "view-a");
    const copyB = instantiateMermaidSvg(result, "view-b");
    expect(copyA).toContain('id="view-a"');
    expect(copyA).toContain("url(#view-a_arrow)");
    expect(copyA).not.toContain(result.renderId);
    expect(copyB).toContain("#view-b .node");
  });

  it("maps failures to controlled error kinds", async () => {
    const mermaid = await mermaidMock();
    mermaid.render.mockRejectedValueOnce(new Error("Parse error on line 2: secret-source"));
    await expect(renderMermaid("graph TD\nA-->", "codex")).rejects.toMatchObject({ kind: "syntax", message: "图表语法有误" });

    await expect(renderMermaid("x".repeat(MERMAID_MAX_SOURCE_CHARS + 1), "codex")).rejects.toMatchObject({ kind: "too-large" });
    await expect(renderMermaid("%%{init: {}}%%\n", "codex")).rejects.toMatchObject({ kind: "empty" });
    expect(mermaid.render).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized SVG output", async () => {
    const mermaid = await mermaidMock();
    mermaid.render.mockResolvedValueOnce({ svg: `<svg viewBox="0 0 1 1">${"<g></g>".repeat(400_000)}</svg>`, diagramType: "flowchart" });
    await expect(renderMermaid("graph TD\nA-->B", "codex")).rejects.toMatchObject({ kind: "too-large" });
  });
});

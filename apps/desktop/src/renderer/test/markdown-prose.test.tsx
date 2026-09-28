import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownProse } from "../components/messages/MarkdownProse";
import { resetMermaidRendererForTests } from "../components/messages/mermaid-renderer";

vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render: vi.fn() } }));

async function mermaidRender() {
  return ((await import("mermaid")).default as unknown as { render: ReturnType<typeof vi.fn> }).render;
}

beforeEach(async () => {
  resetMermaidRendererForTests();
  const render = await mermaidRender();
  render.mockReset();
  render.mockImplementation(async (id: string) => ({
    svg: `<svg id="${id}" viewBox="0 0 400 200"><defs><marker id="${id}_arrow"/></defs><g class="node"><text>Start</text></g></svg>`,
    diagramType: "flowchart-v2",
  }));
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

const FLOW = "flowchart TD\n  A[Start] --> B[Done]";

describe("MarkdownProse", () => {
  it("renders fenced code with a language toolbar and copy action", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<MarkdownProse content={'```ts\nconst answer = 42;\n```'} />);

    expect(screen.getByText("ts")).toBeInTheDocument();
    expect(document.querySelector("code")?.textContent).toContain("const answer = 42;");
    await userEvent.click(screen.getByRole("button", { name: "复制代码" }));
    expect(writeText).toHaveBeenCalledWith("const answer = 42;\n");
    expect(screen.getByText("已复制")).toBeInTheDocument();
  });

  it("routes relative reply links to the workspace file opener", async () => {
    const onOpenWorkspaceFile = vi.fn();
    render(<MarkdownProse content="查看 [src/App.tsx](src/App.tsx)。" onOpenWorkspaceFile={onOpenWorkspaceFile} />);

    const link = screen.getByRole("link", { name: "src/App.tsx" });
    expect(link).not.toHaveAttribute("target");
    await userEvent.click(link);
    expect(onOpenWorkspaceFile).toHaveBeenCalledWith("src/App.tsx");
  });
});

describe("MarkdownProse Mermaid fences", () => {
  it("renders a closed mermaid fence as a diagram instead of a code block", async () => {
    render(<MarkdownProse content={`Intro\n\n\`\`\`MERMAID\n${FLOW}\n\`\`\`\n\nOutro`} />);

    expect(await screen.findByRole("img", { name: "Mermaid 图表：flowchart-v2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "复制代码" })).not.toBeInTheDocument();
    expect(screen.getByText("Intro")).toBeInTheDocument();
    expect(screen.getByText("Outro")).toBeInTheDocument();
    expect((await mermaidRender()).mock.calls[0][1]).toBe(FLOW);
  });

  it("keeps a still-streaming fence and partial language names as code blocks", async () => {
    const { rerender } = render(<MarkdownProse content={`\`\`\`mermaid\n${FLOW}`} />);
    expect(screen.getByRole("button", { name: "复制代码" })).toBeInTheDocument();

    rerender(<MarkdownProse content={"```mer\ngraph TD\n```"} />);
    expect(screen.getByText("mer")).toBeInTheDocument();
    expect(await mermaidRender()).not.toHaveBeenCalled();

    rerender(<MarkdownProse content={`\`\`\`mermaid\n${FLOW}\n\`\`\``} />);
    expect(await screen.findByRole("img", { name: /Mermaid 图表/ })).toBeInTheDocument();
  });

  it("isolates a failing diagram, shows its source, and still renders the others", async () => {
    const renderMock = await mermaidRender();
    renderMock.mockRejectedValueOnce(new Error("Parse error"));
    render(<MarkdownProse content={"```mermaid\ngraph TD\n  A-->\n```\n\nBetween\n\n```mermaid\n" + FLOW + "\n```"} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("无法渲染图表：图表语法有误");
    const failedBlock = alert.closest(".mermaid-block") as HTMLElement;
    expect(within(failedBlock).getByText(/A-->/)).toBeInTheDocument();
    expect(screen.getByText("Between")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: /Mermaid 图表/ })).toBeInTheDocument();
  });

  it("copies the raw source and toggles the source view", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<MarkdownProse content={`\`\`\`mermaid\n${FLOW}\n\`\`\``} />);
    await screen.findByRole("img", { name: /Mermaid 图表/ });

    await userEvent.click(screen.getByRole("button", { name: "复制 Mermaid 源码" }));
    expect(writeText).toHaveBeenCalledWith(FLOW);

    await userEvent.click(screen.getByRole("button", { name: "查看源码" }));
    expect(screen.queryByRole("img", { name: /Mermaid 图表/ })).not.toBeInTheDocument();
    expect(document.querySelector(".mermaid-block pre code")?.textContent).toContain("A[Start] --> B[Done]");
    await userEvent.click(screen.getByRole("button", { name: "显示图表" }));
    expect(screen.getByRole("img", { name: /Mermaid 图表/ })).toBeInTheDocument();
  });

  it("gives repeated identical diagrams distinct SVG ids", async () => {
    const fence = `\`\`\`mermaid\n${FLOW}\n\`\`\``;
    render(<MarkdownProse content={`${fence}\n\n${fence}`} />);
    await waitFor(() => expect(document.querySelectorAll(".mermaid-canvas svg")).toHaveLength(2));

    const ids = Array.from(document.querySelectorAll(".mermaid-canvas svg")).map((svg) => svg.id);
    expect(new Set(ids).size).toBe(2);
    expect(await mermaidRender()).toHaveBeenCalledTimes(1);
  });

  it("opens the expanded preview and closes it with Escape, returning focus", async () => {
    render(<MarkdownProse content={`\`\`\`mermaid\n${FLOW}\n\`\`\``} />);
    await screen.findByRole("img", { name: /Mermaid 图表/ });

    const expand = screen.getByRole("button", { name: "放大查看" });
    await userEvent.click(expand);
    const dialog = screen.getByRole("dialog", { name: "Mermaid 图表预览" });
    expect(within(dialog).getByRole("button", { name: "关闭预览" })).toHaveFocus();
    expect(within(dialog).getByText("100%")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "放大" }));
    expect(within(dialog).getByText("110%")).toBeInTheDocument();
    await userEvent.keyboard("-");
    expect(within(dialog).getByText("100%")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(expand).toHaveFocus();
  });
});

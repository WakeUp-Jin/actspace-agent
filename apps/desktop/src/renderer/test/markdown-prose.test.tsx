import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownProse } from "../components/messages/MarkdownProse";

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

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

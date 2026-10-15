import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonTree } from "../components/ui/JsonTree";

const data = { name: "act", nested: { a: 1, b: [1, 2, 3] }, list: [{ x: 1 }] };

afterEach(() => vi.restoreAllMocks());

describe("JsonTree", () => {
  it("keeps the top level expanded and child containers collapsed", () => {
    render(<JsonTree data={data} label="payload" />);
    const tree = screen.getByRole("tree", { name: "payload" });
    expect(tree).toHaveTextContent("name:");
    const expanders = screen.getAllByRole("button", { name: "展开" });
    expect(expanders).toHaveLength(2);
    expect(expanders.every((node) => node.getAttribute("aria-expanded") === "false")).toBe(true);
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("shows a preview for a collapsed node", () => {
    render(<JsonTree data={data} />);
    const row = screen.getAllByRole("treeitem").find((item) => item.textContent?.startsWith("nested"));
    expect(row?.textContent).toContain("{a: 1, b: [1, 2, 3]}");
  });

  it("expands a child on click and collapses it again", async () => {
    const user = userEvent.setup();
    render(<JsonTree data={data} />);
    await user.click(screen.getAllByRole("button", { name: "展开" })[0]!);
    const group = screen.getByRole("group");
    expect(group).toHaveTextContent("a:");
    await user.click(screen.getByRole("button", { name: "收起" }));
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("toggles with the keyboard", () => {
    render(<JsonTree data={data} />);
    const expander = screen.getAllByRole("button", { name: "展开" })[0]!;
    fireEvent.keyDown(expander, { key: "ArrowRight" });
    expect(screen.getByRole("group")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: "收起" }), { key: "ArrowLeft" });
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("offers an expand affordance for strings longer than the line limit", async () => {
    const user = userEvent.setup();
    const original = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(16 * 20);
    render(<JsonTree data={{ text: original }} />);
    const toggle = screen.getByRole("button", { name: "展开" });
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "收起" })).toBeInTheDocument();
    expect(document.querySelector(".json-tree-stringRaw")?.textContent).toBe(original);
  });

  it("does not show the expand affordance for short strings", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(16);
    render(<JsonTree data={{ text: "short" }} />);
    expect(screen.queryByRole("button", { name: "展开" })).toBeNull();
  });
});

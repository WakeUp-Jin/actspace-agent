import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { DeepSearchBlock } from "../components/messages/DeepSearchBlock";
import { renderMessage } from "../components/conversation/render-message";

type Block = Extract<MessageBlock, { kind: "deep_search" }>;
const base: Block = { kind: "deep_search", id: "ds", createdAt: "now", question: "COP30 outcomes", displayText: "Deep Search COP30 outcomes" };
const done: Block = {
  ...base, status: "completed", stats: "2 searches · 2 sources",
  queries: ["COP30 key outcomes", "COP30 pledges"],
  sources: [{ title: "<b>Carbon</b> Brief", url: "https://carbonbrief.org/x", site: "carbonbrief.org" }, { title: "UNFCCC", url: "https://unfccc.int/y" }],
};

describe("DeepSearchBlock", () => {
  it("runs as one shimmering line that cannot expand", () => {
    const { container } = render(<DeepSearchBlock message={{ ...base, status: "running", displayText: "Deep Search COP30 outcomes · reading 3 pages" }} />);
    expect(screen.getByText("Deep Search COP30 outcomes · reading 3 pages", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector(".tool-log-shimmer")).not.toBeNull();
  });

  it("shows action, question and stats when finished, and expands queries and numbered sources", () => {
    render(<DeepSearchBlock message={done} />);
    const toggle = screen.getByRole("button", { name: /Deep Search/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("Deep Search");
    expect(toggle).toHaveTextContent("COP30 outcomes");
    expect(toggle).toHaveTextContent("2 searches · 2 sources");
    expect(screen.queryByText("搜索词")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("搜索词")).toBeVisible();
    expect(screen.getByText("COP30 pledges")).toBeVisible();
    expect(screen.getByText("引用来源")).toBeVisible();
    const link = screen.getByRole("link", { name: "<b>Carbon</b> Brief" });
    expect(link).toHaveAttribute("href", "https://carbonbrief.org/x");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(document.querySelector("b")).toBeNull();
    expect(screen.getByText("carbonbrief.org")).toBeVisible();
    expect(screen.getByRole("link", { name: "UNFCCC" })).toHaveAttribute("href", "https://unfccc.int/y");
    expect(screen.queryByText("未能打开")).not.toBeInTheDocument();
  });

  it("expands from the keyboard", () => {
    render(<DeepSearchBlock message={done} />);
    const toggle = screen.getByRole("button", { name: /Deep Search/ });
    toggle.focus();
    fireEvent.keyDown(toggle, { key: "Enter" });
    fireEvent.click(toggle); // native buttons turn Enter/Space into click
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("lists pages that could not be opened", () => {
    render(<DeepSearchBlock message={{ ...done, failedPages: [{ url: "https://down.example/page", code: "http_404" }] }} />);
    fireEvent.click(screen.getByRole("button", { name: /Deep Search/ }));
    expect(screen.getByText("未能打开")).toBeVisible();
    expect(screen.getByText("https://down.example/page")).toBeVisible();
    expect(screen.getByText("http_404")).toBeVisible();
  });

  it.each(["failed", "denied"] as const)("shows %s at the row end and the reason when expanded", (status) => {
    render(<DeepSearchBlock message={{ ...base, status, errorText: "DeepSeek 账户余额不足，深度搜索没有执行。" }} />);
    const toggle = screen.getByRole("button", { name: /Deep Search/ });
    expect(toggle).toHaveTextContent(status);
    expect(toggle.closest(".is-error")).not.toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByText("DeepSeek 账户余额不足，深度搜索没有执行。")).toBeVisible();
  });

  it("shows aborted without expansion", () => {
    render(<DeepSearchBlock message={{ ...base, status: "aborted" }} />);
    expect(screen.getByText("aborted")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("can expand a deferred row without detail and asks to load once", () => {
    const onExpand = vi.fn();
    render(<DeepSearchBlock message={{ ...base, status: "completed", stats: "6 searches · 11 sources" }} onExpand={onExpand} />);
    const toggle = screen.getByRole("button", { name: /Deep Search/ });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(onExpand).toHaveBeenCalledTimes(2);
  });

  it("does not expand a finished row with nothing to show", () => {
    render(<DeepSearchBlock message={{ ...base, status: "completed", stats: "0 searches · 0 sources" }} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("0 searches · 0 sources")).toBeVisible();
  });

  it("is dispatched by renderMessage", () => {
    render(<>{renderMessage(done)}</>);
    expect(screen.getByRole("button", { name: /Deep Search/ })).toHaveTextContent("2 searches · 2 sources");
  });
});

import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { renderMessage } from "../components/conversation/render-message";

afterEach(() => vi.useRealTimers());

const waiting: MessageBlock = {
  kind: "status",
  id: "run-1:model-wait",
  content: "Operating Space · Expanding",
  createdAt: "2026-10-23T00:00:00Z",
};

it("shows model waiting only after the 300ms delay", () => {
  vi.useFakeTimers();
  render(<>{renderMessage(waiting)}</>);

  expect(screen.queryByRole("status")).toBeNull();
  act(() => vi.advanceTimersByTime(299));
  expect(screen.queryByRole("status")).toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole("status")).toHaveTextContent(waiting.content);
  expect(screen.getByText(waiting.content)).toHaveClass("tool-log-text-running");
});

it("cancels the waiting timer when the request finishes before the delay", () => {
  vi.useFakeTimers();
  const { rerender } = render(<>{renderMessage(waiting)}</>);
  act(() => vi.advanceTimersByTime(200));
  rerender(<></>);

  expect(vi.getTimerCount()).toBe(0);
  act(() => vi.advanceTimersByTime(300));
  expect(screen.queryByRole("status")).toBeNull();
});

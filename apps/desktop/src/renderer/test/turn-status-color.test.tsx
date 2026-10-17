import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { renderMessage } from "../components/conversation/render-message";

it.each(["error", "status"])("uses only the danger text color for %s failures", kind => {
  const message = { id: "failed", kind, title: "失败", content: "Failed request", tone: "error", createdAt: "2026-10-16T00:00:00Z" } as MessageBlock;
  render(<>{renderMessage(message)}</>);
  const line = screen.getByText("Failed request");
  expect(line).toHaveClass("text-on-danger");
  expect(line).not.toHaveClass("text-text-faint");
});

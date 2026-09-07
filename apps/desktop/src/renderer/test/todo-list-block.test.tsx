import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { TodoListBlock } from "../components/messages/TodoListBlock";

function todoMessage(
  partial: Partial<Extract<MessageBlock, { kind: "todo" }>> = {},
): Extract<MessageBlock, { kind: "todo" }> {
  return {
    kind: "todo",
    id: "todo-block",
    todos: [
      {
        id: "todo-1",
        content: "Inspect the AgentRun lifecycle",
        status: "completed",
        createdAt: "2026-08-08T00:00:00.000Z",
        updatedAt: "2026-08-08T00:01:00.000Z",
      },
      {
        id: "todo-2",
        content: "Implement the Todo renderer with a deliberately long line that must remain readable without resizing the message layout",
        status: "in_progress",
        activeForm: "Implementing the Todo renderer",
        createdAt: "2026-08-08T00:00:00.000Z",
        updatedAt: "2026-08-08T00:02:00.000Z",
      },
      {
        id: "todo-3",
        content: "Run verification",
        status: "pending",
        createdAt: "2026-08-08T00:00:00.000Z",
        updatedAt: "2026-08-08T00:00:00.000Z",
      },
    ],
    totalCount: 3,
    completedCount: 1,
    revision: 2,
    displayText: "1 of 3 To-dos Completed",
    status: "running",
    createdAt: "2026-08-08T00:02:00.000Z",
    ...partial,
  };
}

describe("TodoListBlock", () => {
  it("shows a running list expanded with all three statuses", () => {
    render(<TodoListBlock message={todoMessage()} />);

    const toggle = screen.getByRole("button", { name: /1 of 3 To-dos Completed/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Inspect the AgentRun lifecycle")).toBeInTheDocument();
    expect(screen.getByText("Implementing the Todo renderer")).toBeInTheDocument();
    expect(screen.getByText("Run verification")).toBeInTheDocument();
    const completed = screen.getByRole("listitem", { name: /Completed: Inspect/ });
    const inProgress = screen.getByRole("listitem", { name: /In progress: Implement/ });
    const pending = screen.getByRole("listitem", { name: /Pending: Run/ });
    expect(completed).toBeInTheDocument();
    expect(inProgress).toBeInTheDocument();
    expect(pending).toBeInTheDocument();
    expect(completed.querySelector("p")).toHaveClass("line-through");
    expect(inProgress.querySelector("svg")).toHaveClass("animate-spin");
    expect(pending.querySelector("svg")).not.toHaveClass("animate-spin");
  });

  it("starts an all-completed list collapsed and allows review", async () => {
    const complete = todoMessage({
      todos: todoMessage().todos.map((todo) => ({ ...todo, status: "completed" })),
      completedCount: 3,
      displayText: "3 of 3 To-dos Completed",
      status: "completed",
    });
    render(<TodoListBlock message={complete} />);

    const toggle = screen.getByRole("button", { name: /3 of 3/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Run verification")).toBeNull();
    await userEvent.click(toggle);
    expect(screen.getByText("Run verification")).toBeInTheDocument();
  });

  it("renders an empty snapshot without placeholder controls", () => {
    render(<TodoListBlock message={todoMessage({
      todos: [],
      totalCount: 0,
      completedCount: 0,
      revision: 0,
      displayText: "0 of 0 To-dos Completed",
    })} />);

    expect(screen.getByText("0 of 0 To-dos Completed")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
});

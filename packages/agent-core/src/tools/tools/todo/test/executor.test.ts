import { describe, expect, it } from "vitest";
import { createToolManager } from "../../../index";

function createManager() {
  return createToolManager({
    workspaceRoot: "/tmp/todo-workspace",
    sessionId: "session-todo",
    agentRunId: "run-todo",
    primaryProvider: "mock",
    toolProfile: "full",
  });
}

describe("Todo tools", () => {
  it("registers read and write without approval hooks", () => {
    const manager = createManager();
    expect(manager.get("todo_read")).toMatchObject({ isReadOnly: true, previewKind: "todo" });
    expect(manager.get("todo_write")).toMatchObject({ isReadOnly: false, previewKind: "todo" });
    expect(manager.get("todo_write")?.checkPermissions).toBeUndefined();
  });

  it("shares one AgentRun store across write and filtered read", async () => {
    const manager = createManager();
    const written = await manager.execute("todo_write", {
      todos: [
        { content: "Inspect", status: "completed" },
        { content: "Implement", status: "in_progress" },
      ],
    });
    expect(written.success).toBe(true);
    expect(written.structured).toMatchObject({
      operation: "write",
      uiSnapshot: { totalCount: 2, revision: 1 },
    });

    const read = await manager.execute("todo_read", { statusFilter: ["in_progress"] });
    expect(read.success).toBe(true);
    expect(JSON.parse(String(read.data))).toMatchObject({
      totalCount: 1,
      revision: 1,
      todos: [{ content: "Implement", status: "in_progress" }],
    });
    expect(read.structured).toMatchObject({ uiSnapshot: { totalCount: 2, revision: 1 } });
  });

  it("returns a stable error code and preserves the previous snapshot", async () => {
    const manager = createManager();
    await manager.execute("todo_write", {
      todos: [{ content: "Keep", status: "pending" }],
    });
    const failed = await manager.execute("todo_write", {
      todos: [
        { content: "One", status: "in_progress" },
        { content: "Two", status: "in_progress" },
      ],
    });

    expect(failed).toMatchObject({
      success: false,
      error: expect.stringContaining("TODO_MULTIPLE_IN_PROGRESS"),
      structured: {
        errorCode: "TODO_MULTIPLE_IN_PROGRESS",
        uiSnapshot: { totalCount: 1, revision: 1 },
      },
    });
  });

  it("keeps Todo tools isolated between ToolManager instances", async () => {
    const first = createManager();
    const second = createManager();
    await first.execute("todo_write", { todos: [{ content: "Only first", status: "pending" }] });

    const secondRead = await second.execute("todo_read", {});
    expect(JSON.parse(String(secondRead.data))).toMatchObject({ totalCount: 0, revision: 0 });
  });

  it("initializes an exact AgentRun store from a recovered snapshot", async () => {
    const manager = createToolManager({
      workspaceRoot: "/tmp/todo-workspace",
      sessionId: "session-todo",
      agentRunId: "run-todo",
      primaryProvider: "mock",
      toolProfile: "full",
      initialTodoSnapshot: {
        todos: [{
          id: "todo-restored",
          content: "Resume work",
          status: "in_progress",
          createdAt: "2026-08-08T00:00:00.000Z",
          updatedAt: "2026-08-08T00:01:00.000Z",
        }],
        totalCount: 1,
        revision: 4,
      },
    });

    const read = await manager.execute("todo_read", {});
    expect(JSON.parse(String(read.data))).toMatchObject({
      revision: 4,
      todos: [{ id: "todo-restored", content: "Resume work" }],
    });
  });
});

import { describe, expect, it } from "vitest";
import type { BackgroundTaskRecord } from "@actspace/background-tasks";
import { createBackgroundTasksSource } from "../source.js";

const task = (taskId: string, status: BackgroundTaskRecord["status"] = "running"): BackgroundTaskRecord => ({
  taskId,
  kind: taskId.startsWith("agent") ? "agent" : "bash",
  sessionId: "s",
  callId: `c-${taskId}`,
  description: `do ${taskId}`,
  status,
  startedAt: Date.parse("2026-10-22T06:02:11Z"),
  ...(taskId.startsWith("agent")
    ? { agent: { transcriptPath: `/data/${taskId}/transcript.md`, label: "explore" } }
    : {}),
});

function run(source: ReturnType<typeof createBackgroundTasksSource>, turnId: string) {
  const written: string[] = [];
  void source.get({ request: { sessionId: "s", turnId } } as never, (content) => {
    for (const item of content.supplements ?? []) written.push(item.text);
  });
  return written;
}

describe("background tasks context source", () => {
  it("writes nothing for a Session without background work", () => {
    expect(run(createBackgroundTasksSource({ list: () => [] }), "t1")).toEqual([]);
  });

  it("lists running Bash tasks and background subagents once per turn", () => {
    let tasks = [task("bash_1"), task("agent_2")];
    const source = createBackgroundTasksSource({ list: () => tasks });
    const first = run(source, "t1");
    expect(first[0]).toContain("- bash_1 · bash · do bash_1 · started 2026-10-22T");
    expect(first[0]).toMatch(
      /^- agent_2 · agent · do agent_2 · explore · started 2026-10-22T\S+ · transcript: \/data\/agent_2\/transcript\.md$/m,
    );
    expect(first[0].split("\n").at(-1)).toBe(
      "Do not start duplicates. You are notified when each one finishes; task_stop stops one.",
    );
    tasks = [task("bash_1", "completed"), task("agent_2")];
    expect(run(source, "t1")).toEqual(first);
    expect(run(source, "t2")[0]).not.toContain("bash_1");
  });

  it("writes a closing text when every task has ended", () => {
    const source = createBackgroundTasksSource({ list: () => [task("bash_1", "completed")] });
    expect(run(source, "t1")).toEqual(["No background tasks are running."]);
  });
});

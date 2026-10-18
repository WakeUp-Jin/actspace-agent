import { formatElapsed, primaryAction, queuedMessages, statusKind } from "../composer-state";

it("covers every primaryAction combination", () => {
  const bools = [false, true];
  for (const hasText of bools) for (const running of bools) for (const awaitingApproval of bools) for (const connected of bools) for (const maintenance of bools) {
    const expected = !connected ? "disabled" : hasText ? (maintenance ? "disabled" : "send") : running || awaitingApproval ? "stop" : "disabled";
    expect(primaryAction({ hasText, running, awaitingApproval, connected, maintenance })).toBe(expected);
  }
  expect(primaryAction({ hasText: true, running: false, awaitingApproval: false, connected: true })).toBe("send");
  expect(primaryAction({ hasText: false, running: true, awaitingApproval: false, connected: true })).toBe("stop");
  expect(primaryAction({ hasText: false, running: false, awaitingApproval: true, connected: true })).toBe("stop");
  expect(primaryAction({ hasText: false, running: false, awaitingApproval: false, connected: true })).toBe("disabled");
});

it("lists pending queued tasks in queue order with their text", () => {
  const task = (taskId: string, state: string, content: unknown) => ({ taskId, submissionId: taskId, content, acceptedSeq: 1, state, targetRunId: null, runId: null, continuationOf: null });
  const snapshot = { sessionId: "s", revision: 2, paused: false, runs: [], queue: ["b", "c", "gone"], tasks: [task("a", "claimed", "running"), task("b", "pending", "第二条"), task("c", "pending", { kind: "composer-task", original: { userInput: "第三条" }, prepared: [] })] };
  expect(queuedMessages(snapshot as never)).toEqual([{ taskId: "b", text: "第二条" }, { taskId: "c", text: "第三条" }]);
  expect(queuedMessages(null)).toEqual([]);
});

it("formats elapsed time and status priority", () => {
  expect(formatElapsed(12_400)).toBe("12s");
  expect(formatElapsed(65_000)).toBe("1m 05s");
  expect(statusKind({ awaitingApproval: true, running: true, connected: true, maintenance: false })).toBe("approval");
  expect(statusKind({ awaitingApproval: false, running: true, connected: true, maintenance: false })).toBe("running");
  expect(statusKind({ awaitingApproval: false, running: false, connected: false, maintenance: false })).toBe("offline");
  expect(statusKind({ awaitingApproval: false, running: false, connected: true, maintenance: true })).toBe("maintenance");
});

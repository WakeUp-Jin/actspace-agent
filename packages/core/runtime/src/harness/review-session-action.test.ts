import { expect, it } from "vitest";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { SessionHandle } from "@actspace/session-persistence";
import { reviewSessionAction } from "./review-session-action.js";

type Fixture = { seq: number; type: string; data: Record<string, unknown>; surface?: unknown };

/** 只模拟 reviewSessionAction 用到的 Journal 读法：按会话的懒投影和 revision 之后的事件。 */
function fakeSession(events: Fixture[]): SessionHandle {
  const projections = new Map<symbol, { seq: number; state: unknown }>();
  const journal = {
    get lastSeq() { return events.at(-1)?.seq ?? -1; },
    eventsAfter: (seq: number) => events.filter(event => event.seq > seq),
    project<T>(key: symbol, initial: () => T, reduce: (state: T, event: SessionEventEnvelopeV1) => T): T {
      const prior = projections.get(key);
      let state = prior ? prior.state as T : initial();
      for (const event of events) if (event.seq > (prior?.seq ?? -1)) state = reduce(state, event as unknown as SessionEventEnvelopeV1);
      projections.set(key, { seq: events.at(-1)?.seq ?? -1, state });
      return state;
    },
  };
  return { header: { sessionId: "s" }, journal } as unknown as SessionHandle;
}

it.each([null, "title", "logicalRequestId", "sessionId", "callId", "purpose", "agentRunId", "turnId", "stepId"])("ignores only its own billing facts; foreign change=%s", async foreign => {
  const events: Fixture[] = [
    { seq: 0, type: "user/message", data: { messageId: "u", content: "inspect files" }, surface: { kind: "append" } },
    { seq: 1, type: "tool/call", data: { agentRunId: "r", turnId: "t", stepId: "step", callId: "c" } },
  ];
  const session = fakeSession(events);
  const task = reviewSessionAction(session, { review: async input => {
    expect(input).toMatchObject({ sessionId: "s", agentRunId: "r", turnId: "t", stepId: "step", callId: "c" });
    events.push({ seq: 2, type: "llm/auxiliary-start", data: { ...input, purpose: "auto-review" } });
    events.push({ seq: 3, type: "llm/auxiliary-end", data: { ...input, purpose: "auto-review" } });
    if (foreign === "title") events.push({ seq: 4, type: "session/title-set", data: {} });
    else if (foreign) events.push({ seq: 4, type: "llm/auxiliary-start", data: { ...input, purpose: "auto-review", [foreign]: "other" } });
    return { approved: true };
  } }, { callId: "c", model: "review", action: {}, workspaceRoot: "/fixture", signal: new AbortController().signal } as never);
  if (foreign) await expect(task).rejects.toThrow("Review context changed");
  else expect(await task).toEqual({ approved: true });
});

it("reviews the latest tool call with that id and keeps the original conversation across reviews", async () => {
  const events: Fixture[] = [
    { seq: 0, type: "user/message", data: { messageId: "u", content: "inspect files" }, surface: { kind: "append" } },
    { seq: 1, type: "tool/call", data: { agentRunId: "r", turnId: "t", stepId: "step", callId: "c", name: "read" } },
  ];
  const session = fakeSession(events);
  const snapshots: unknown[] = [];
  const reviewer = { review: async (input: { snapshot: { conversation: unknown[] } }) => { snapshots.push(input.snapshot.conversation); return { approved: true }; } };
  const input = { callId: "c", model: "review", action: {}, workspaceRoot: "/fixture", signal: new AbortController().signal } as never;
  await reviewSessionAction(session, reviewer as never, input);
  events.push({ seq: 2, type: "tool/result", data: { callId: "c", status: "completed" } });
  events.push({ seq: 3, type: "user/message", data: { messageId: "u2", content: "now delete nothing" }, surface: { kind: "append" } });
  events.push({ seq: 4, type: "tool/call", data: { agentRunId: "r2", turnId: "t2", stepId: "step2", callId: "c", name: "write" } });
  const second = await reviewSessionAction(session, { review: async (input: { agentRunId: string; snapshot: { conversation: unknown[] } }) => { expect(input).toMatchObject({ agentRunId: "r2", turnId: "t2", stepId: "step2" }); snapshots.push(input.snapshot.conversation); return { approved: false }; } } as never, input);
  expect(second).toEqual({ approved: false });
  expect(JSON.stringify(snapshots[1])).toContain("now delete nothing");
  expect(JSON.stringify(snapshots[1])).toContain("inspect files");
  expect((snapshots[1] as unknown[]).length).toBe((snapshots[0] as unknown[]).length + 3);
});

it("never invents a parent when the tool call is missing", async () => {
  const session = fakeSession([]);
  await expect(reviewSessionAction(session, { review: async () => { throw new Error("must not dispatch"); } }, { callId: "missing" } as never)).rejects.toThrow("owning tool call");
});

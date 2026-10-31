import { expect, it } from "vitest";
import type { SessionHandle } from "@actspace/session-persistence";
import { reviewSessionAction } from "./review-session-action.js";

it.each([null, "title", "logicalRequestId", "sessionId", "callId", "purpose", "agentRunId", "turnId", "stepId"])("ignores only its own billing facts; foreign change=%s", async foreign => {
  const events: { seq: number; type: string; data: Record<string, unknown>; surface?: unknown }[] = [
    { seq: 0, type: "user/message", data: {}, surface: { kind: "append", node: { content: "inspect files" } } },
    { seq: 1, type: "tool/call", data: { agentRunId: "r", turnId: "t", stepId: "step", callId: "c" } },
  ];
  const session = { header: { sessionId: "s" }, journal: { get lastSeq() { return events.at(-1)!.seq; }, iterateEvents: () => events.values() } } as unknown as SessionHandle;
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

it("never invents a parent when the tool call is missing", async () => {
  const session = { header: { sessionId: "s" }, journal: { lastSeq: -1, iterateEvents: () => [].values() } } as unknown as SessionHandle;
  await expect(reviewSessionAction(session, { review: async () => { throw new Error("must not dispatch"); } }, { callId: "missing" } as never)).rejects.toThrow("owning tool call");
});

import { randomUUID } from "node:crypto";
import { createReviewContext, reduceReviewContext, reviewSnapshot, type AutoReviewer } from "@actspace/auto-review";
import type { SessionHandle } from "@actspace/session-persistence";
import type { AutoReviewInput } from "@actspace/tool-runtime";

/** 审查上下文按会话投影：首次审查回放一次，之后每次只折叠新增事件（perf-backlog P1）。 */
const REVIEW_CONTEXT = Symbol("auto-review-context");

/** Billing facts from this review are expected; every other concurrent fact invalidates the snapshot. */
export async function reviewSessionAction(session: SessionHandle, reviewer: AutoReviewer, input: AutoReviewInput) {
  const context = session.journal.project(REVIEW_CONTEXT, createReviewContext, reduceReviewContext);
  const data = context.toolCalls.get(input.callId);
  if (!data || ["agentRunId", "turnId", "stepId"].some((key) => typeof data[key] !== "string" || !data[key]))
    throw new Error("Review requires its owning tool call");
  const revision = session.journal.lastSeq;
  const logicalRequestId = randomUUID();
  const decision = await reviewer.review({
    sessionId: session.header.sessionId,
    agentRunId: data.agentRunId as string,
    turnId: data.turnId as string,
    stepId: data.stepId as string,
    callId: input.callId,
    logicalRequestId,
    model: input.model ?? "default",
    signal: input.signal,
    snapshot: {
      conversation: reviewSnapshot(context),
      action: input.action,
      workspaceRoot: input.workspaceRoot,
      execution: "Existing executor; sandbox isolation is not guaranteed",
    },
  });
  for (const event of session.journal.eventsAfter(revision)) {
    const fact = event.data as Record<string, unknown>;
    if (
      (event.type !== "llm/auxiliary-start" && event.type !== "llm/auxiliary-end") ||
      fact.purpose !== "auto-review" ||
      fact.logicalRequestId !== logicalRequestId ||
      fact.sessionId !== session.header.sessionId ||
      fact.callId !== input.callId ||
      ["agentRunId", "turnId", "stepId"].some((key) => fact[key] !== data[key])
    )
      throw new Error("Review context changed");
  }
  return decision;
}

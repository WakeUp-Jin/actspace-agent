import { describe, it, expect } from "vitest";
import { CordisContextClass } from "@actspace/cordis-adapter";
import { parseReview } from "../review.js";
import { reviewConversation } from "../context.js";
import { apply } from "../plugin.js";
import { manifest } from "../manifest.js";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";

describe("auto reviewer", () => {
  it.each(['{"approved":true}', '{"approved":false,"reason":null}', '{"approved":true,"reason":""}'])("accepts optional reason: %s", value => expect(parseReview(value)).toHaveProperty("approved"));
  it.each(['true', '{"approved":"true"}', '```json\n{"approved":true}\n```', '{"approved":true,"risk":0}', '{"approved":true,"reason":1}'])("rejects malformed result: %s", value => expect(() => parseReview(value)).toThrow());
  it("loads the service without tools or event codecs", async () => {
    const ctx = new CordisContextClass();
    expect(() => apply(ctx)).toThrow("llm.service");
    ctx.provide?.("llm.service", {});
    await ctx.plugin({ inject: ["llm.service"], apply: inner => apply(inner as never) });
    expect(ctx.get?.("approval.auto-review")).toHaveProperty("review");
    expect(manifest).toBeDefined();
    await ctx.fiber.dispose();
    expect(ctx.get("approval.auto-review")).toBeUndefined();
  });
  it("retains original user revisions, excludes reasoning and ordinary tool bodies", () => {
    const events = [
      { type: "user/message", surface: { kind: "append", node: { content: "inspect files" } } },
      { type: "assistant/message", surface: { kind: "append", node: { content: [{ type: "text", text: "May I inspect?" }, { type: "reasoning", text: "hidden-canary" }] } } },
      { type: "user/message", surface: { kind: "append", node: { content: "yes, but no deletion" } } },
      { type: "tool/result", data: { callId: "x", status: "completed", modelOutput: "tool-body-canary" } },
    ] as unknown as SessionEventEnvelopeV1[];
    const content = JSON.stringify(reviewConversation(events));
    expect(content).toContain("no deletion"); expect(content).toContain("May I inspect");
    expect(content).not.toContain("hidden-canary"); expect(content).not.toContain("tool-body-canary");
    expect(() => reviewConversation([])).toThrow();
    expect(() => reviewConversation([{ ...events[0], surface: { kind: "append", node: { content: "x".repeat(65_000) } } }] as never)).toThrow();
  });
});

it("makes a tool-free bounded model request and releases the prepared call", async () => {
  const { createAutoReviewer } = await import("../review.js");
  let request: unknown;
  let released = false;
  const reviewer = createAutoReviewer({ prepareAsync: async (input: unknown) => { request = input; return { dispatch: async () => (async function* () { yield { type: "done", content: [{ type: "text", text: '{"approved":true,"reason":"Task matches"}' }] }; })(), release: () => { released = true; } }; } } as never);
  expect(await reviewer.review({ sessionId: "s", callId: "c", model: "current-main", snapshot: { action: { command: "ls" } }, signal: new AbortController().signal })).toEqual({ approved: true, reason: "Task matches" });
  expect(request).toMatchObject({ routeId: "auto-review", model: "current-main", tools: [] });
  expect(released).toBe(true);
  await expect(reviewer.review({ sessionId: "s", callId: "c", model: "m", snapshot: "x".repeat(96_001), signal: new AbortController().signal })).rejects.toThrow("exceeds limit");
});

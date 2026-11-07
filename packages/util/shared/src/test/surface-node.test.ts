import { describe, expect, it } from "vitest";
import { surfaceNode, type SurfaceNodeSource } from "../runtime-v2";

const append = { kind: "append" } as const;
const event = (type: string, data: SurfaceNodeSource["data"], surface: SurfaceNodeSource["surface"] = append): SurfaceNodeSource => ({ type, data, surface });

describe("surfaceNode", () => {
  it("derives every model-visible event from its data", () => {
    expect(surfaceNode(event("user/message", { messageId: "u1", content: "hi" }))).toEqual({ kind: "user", messageId: "u1", content: "hi" });
    expect(surfaceNode(event("assistant/message", { messageId: "a1", content: [{ type: "text", text: "ok" }] }))).toEqual({ kind: "assistant", messageId: "a1", content: [{ type: "text", text: "ok" }] });
    expect(surfaceNode(event("agent/inbox/spliced", { operation: "claim", messageId: "m1", content: "note" }))).toEqual({ kind: "user", messageId: "m1", content: "note" });
    expect(surfaceNode(event("tool/result", { callId: "c1", status: "completed", modelOutput: [{ type: "text", text: "out" }] }))).toEqual({ kind: "tool-result", messageId: "tool-c1", callId: "c1", content: [{ type: "text", text: "out" }], isError: false });
    expect(surfaceNode(event("tool/recovery-outcome", { callId: "c2", repairId: "r1", content: "not started" }))).toEqual({ kind: "tool-result", messageId: "recovery-r1-c2", callId: "c2", content: "not started", isError: true });
    const summary = { kind: "user", messageId: "compaction-1", content: "summary" };
    expect(surfaceNode(event("surface/replaced", { node: summary }, { kind: "replace", start: 0, end: 2, sourceEventSeqs: [1, 2] }))).toBe(summary);
  });

  it("marks a tool result as an error unless it completed", () => {
    for (const status of ["failed", "denied", "cancelled"]) expect(surfaceNode(event("tool/result", { callId: "c", status, modelOutput: "x" }))).toMatchObject({ isError: true });
  });

  it("returns null without a surface operation, for other event types, or with missing fields", () => {
    expect(surfaceNode(event("user/message", { messageId: "u1", content: "hi" }, null))).toBeNull();
    expect(surfaceNode(event("turn/start", { turnId: "t" }))).toBeNull();
    expect(surfaceNode(event("user/message", { messageId: "u1" }))).toBeNull();
    expect(surfaceNode(event("agent/inbox/spliced", { operation: "discard", messageId: "m1", content: "x" }))).toBeNull();
    expect(surfaceNode(event("surface/replaced", { node: { kind: "user" } }, { kind: "replace", start: 0, end: 1, sourceEventSeqs: [0] }))).toBeNull();
  });

  it("reuses the data values and derives each event once", () => {
    const content = [{ type: "text", text: "big" }];
    const source = event("tool/result", { callId: "c1", status: "completed", modelOutput: content });
    const first = surfaceNode(source);
    expect(first?.content).toBe(content);
    expect(surfaceNode(source)).toBe(first);
  });
});

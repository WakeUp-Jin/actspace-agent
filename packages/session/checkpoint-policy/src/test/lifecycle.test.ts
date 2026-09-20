import { describe, expect, it } from "vitest";
import { apply } from "../plugin.js";

describe("session checkpoint policy lifecycle", () => {
  it("registers one required checkpoint handler and flushes the addressed live session", async () => {
    const calls: unknown[] = [];
    const listeners = new Map<string, (payload: unknown) => Promise<void>>();
    const context = {
      get: (id: string) => id === "session.runtime" ? { getOpen: () => ({ flush: async (seq?: number) => { calls.push(seq); } }) } : undefined,
      on: (id: string, listener: (payload: unknown) => Promise<void>) => { listeners.set(id, listener); },
    };
    apply(context);
    await listeners.get("session/checkpoint")!({ sessionId: "session-1", throughSeq: 7, reason: "before-tool-body" });
    expect(calls).toEqual([7]);
  });

  it("rejects a checkpoint for a session that is not live", async () => {
    const listeners = new Map<string, (payload: unknown) => Promise<void>>();
    apply({
      get: () => ({ getOpen: () => undefined }),
      on: (id: string, listener: (payload: unknown) => Promise<void>) => { listeners.set(id, listener); },
    });
    await expect(listeners.get("session/checkpoint")!({ sessionId: "missing", throughSeq: 0 })).rejects.toThrow("not live");
  });
});

import { describe, expect, it } from "vitest";
import { apply } from "../plugin.js";

describe("session checkpoint policy lifecycle", () => {
  it("provides one required checkpoint service and flushes the addressed live session", async () => {
    const calls: unknown[] = [];
    const services = new Map<string, { flush(payload: unknown): Promise<void> }>();
    const context = {
      get: (id: string) => id === "session.runtime" ? { getOpen: () => ({ flush: async (seq?: number) => { calls.push(seq); } }) } : undefined,
      provide: (id: string, service: unknown) => { services.set(id, service as { flush(payload: unknown): Promise<void> }); },
    };
    apply(context);
    await services.get("session.checkpoint")!.flush({ sessionId: "session-1", throughSeq: 7, reason: "before-tool-body" });
    expect(calls).toEqual([7]);
  });

  it("awaits the actual persistence barrier and propagates its failure", async () => {
    let reject!: (error: Error) => void;
    const persistence = new Promise<void>((_resolve, fail) => { reject = fail; });
    let checkpoint!: { flush(payload: unknown): Promise<void> };
    apply({ get: () => ({ getOpen: () => ({ flush: () => persistence }) }), provide: (_id, value) => { checkpoint = value as typeof checkpoint; } });
    let settled = false;
    const result = checkpoint.flush({ sessionId: "s", throughSeq: 1 }).finally(() => { settled = true; });
    const assertion = expect(result).rejects.toThrow("disk unavailable");
    await Promise.resolve(); expect(settled).toBe(false);
    reject(new Error("disk unavailable"));
    await assertion;
    expect(settled).toBe(true);
  });

  it("rejects a checkpoint for a session that is not live", async () => {
    const services = new Map<string, { flush(payload: unknown): Promise<void> }>();
    apply({
      get: () => ({ getOpen: () => undefined }),
      provide: (id: string, service: unknown) => { services.set(id, service as { flush(payload: unknown): Promise<void> }); },
    });
    await expect(services.get("session.checkpoint")!.flush({ sessionId: "missing", throughSeq: 0 })).rejects.toThrow("not live");
  });
});

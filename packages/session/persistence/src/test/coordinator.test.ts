import { describe, expect, it } from "vitest";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { SessionPersistenceCoordinator } from "../coordinator.js";

function event(seq: number): SessionEventEnvelopeV1 {
  return { recordKind: "event", seq, type: "turn/start", eventVersion: 1, criticality: "core", time: "2026-09-20T00:00:00.000Z", source: { ownerPluginId: "@actspace/core" }, data: { turnId: `turn-${seq}` }, surface: null, provenance: {} } as SessionEventEnvelopeV1;
}

describe("SessionPersistenceCoordinator", () => {
  it("accepts events before the backend append and makes a requested prefix durable on flush", async () => {
    const order: string[] = [];
    const driver = {
      append: async (events: readonly SessionEventEnvelopeV1[]) => { order.push(`write:${events[0]?.seq}`); },
      flush: async () => undefined,
      assertOwned: async () => undefined,
      close: async () => undefined,
    };
    const coordinator = new SessionPersistenceCoordinator(driver, []);
    coordinator.accept(event(0));
    order.push("accepted");
    await coordinator.flush(0);
    expect(order).toEqual(["accepted", "write:0"]);
    expect(coordinator.durableSeq).toBe(0);
  });

  it("retains the failure boundary when the backend rejects a batch", async () => {
    const cause = new Error("fsync failed");
    const driver = {
      append: async () => { throw cause; },
      flush: async () => undefined,
      assertOwned: async () => undefined,
      close: async () => undefined,
    };
    const coordinator = new SessionPersistenceCoordinator(driver, []);
    coordinator.accept(event(0));
    await expect(coordinator.flush(0)).rejects.toThrow("fsync failed");
    expect(coordinator.blocked).toBe(true);
    expect(coordinator.durableSeq).toBe(-1);
    await expect(coordinator.flush(0)).rejects.toThrow();
  });
});

it("does not advance durable sequence when append succeeds but flush fails, and still closes", async () => {
  let closed = false;
  const coordinator = new SessionPersistenceCoordinator({ append: async () => undefined, flush: async () => { throw new Error("flush failed"); }, assertOwned: async () => undefined, close: async () => { closed = true; } }, []);
  coordinator.accept(event(0));
  await expect(coordinator.flush(0)).rejects.toThrow("flush failed");
  expect(coordinator.durableSeq).toBe(-1);
  expect(coordinator.blocked).toBe(true);
  await expect(coordinator.close(0)).rejects.toThrow(); expect(closed).toBe(true);
});

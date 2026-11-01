import { expect, it } from "vitest";
import { HostObservations } from "../observation.js";
import type { HostRequestContext } from "../server.js";
it("retries a changing snapshot and sends later events only after the response", async () => {
  const hub = new HostObservations("epoch"); const sent: unknown[] = [], after: (() => void)[] = [], cleanup: (() => void)[] = [];
  const context: HostRequestContext = { deviceId: "device", connectionId: "connection", notify: (_method, event) => sent.push(event), onClose: callback => cleanup.push(callback), afterReply: callback => after.push(callback) };
  let reads = 0;
  const result = await hub.observe("session", async () => {
    if (++reads === 1) { hub.publish("session", "during read"); return "stale"; }
    return "fresh";
  }, context);
  expect(reads).toBe(2); expect(result.snapshot).toBe("fresh"); expect(result.cursor).toBe(1);
  hub.publish("session", "after snapshot"); expect(sent).toEqual([]);
  after.forEach(callback => callback());
  expect(sent).toEqual([{ subscriptionId: result.subscriptionId, epoch: "epoch", cursor: 2, value: "after snapshot" }]);
  expect(() => hub.unobserve(result.subscriptionId, "other")).toThrow("another connection");
  cleanup.forEach(callback => callback()); hub.publish("session", "after close"); expect(sent).toHaveLength(1);
});
it("disconnects an overflowing pre-reply observer instead of silently losing events", async () => {
  const hub = new HostObservations("epoch"), after: (() => void)[] = []; let closed = false;
  const context: HostRequestContext = { deviceId: "d", connectionId: "c", notify() {}, onClose() {}, afterReply: callback => after.push(callback), close: () => { closed = true; } };
  await hub.observe("s", async () => "snapshot", context);
  hub.publish("s", "x".repeat(9 * 1024 * 1024));
  expect(closed).toBe(true); after.forEach(callback => callback());
});

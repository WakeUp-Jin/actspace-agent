import { HostEventRouter } from "../host-events";

const event = (subscriptionId: string, value: unknown, cursor = 1) => ({ subscriptionId, epoch: "e1", cursor, value });

it("delivers events to their subscription and replays ones that arrived before the listener", () => {
  const router = new HostEventRouter();
  router.accept(event("a", 1));
  router.accept(event("b", 2));
  const seen: unknown[] = [];
  router.on("a", value => seen.push(value));
  router.accept(event("a", 3, 2));
  expect(seen).toEqual([1, 3]);
  router.forget("b");
  const other: unknown[] = [];
  router.on("b", value => other.push(value));
  expect(other).toEqual([]);
});

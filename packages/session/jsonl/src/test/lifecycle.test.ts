import { describe, expect, it } from "vitest";
import { activate } from "../plugin.js";

describe("session jsonl plugin", () => {
  it("publishes raw JSONL backend service and disposes", async () => {
    const activation = activate();
    expect(activation.services?.["session.jsonl"]).toBeDefined();
    await activation.dispose();
  });
});

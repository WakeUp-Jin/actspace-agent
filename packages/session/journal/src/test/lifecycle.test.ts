import { describe, expect, it } from "vitest";
import { activate } from "../plugin.js";

describe("session journal plugin", () => {
  it("publishes codec-aware journal service and disposes", async () => {
    const activation = activate();
    expect(activation.services?.["session.journal"]).toBeDefined();
    await activation.dispose();
  });
});

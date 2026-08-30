import { describe, expect, it } from "vitest";
import { activate } from "../plugin.js";

describe("session projection plugin", () => {
  it("publishes deterministic projection service and disposes", async () => {
    const activation = activate();
    expect(activation.services?.["session.projection"]).toBeDefined();
    await activation.dispose();
  });
});

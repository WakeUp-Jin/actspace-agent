import { describe, expect, it } from "vitest";
import { activate } from "../plugin.js";

describe("approval plugin", () => {
  it("publishes the host approval seam and disposes", async () => {
    const activation = activate();
    expect(activation.services?.["tools.approval"]).toBeDefined();
    await activation.dispose();
  });
});

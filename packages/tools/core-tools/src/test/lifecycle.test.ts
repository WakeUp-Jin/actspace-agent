import { describe, expect, it } from "vitest";
import { activate } from "../plugin.js";

describe("core tools plugin", () => {
  it("publishes definitions and registration behavior", async () => {
    const activation = activate();
    expect(activation.services?.["tools.core"]).toMatchObject({ registerCoreTools: expect.any(Function) });
    await activation.dispose();
  });
});

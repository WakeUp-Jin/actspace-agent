import { describe, expect, it } from "vitest";
import { activate } from "../plugin.js";

describe("pi-ai plugin", () => {
  it("publishes provider adapter constructors and disposes", async () => {
    const activation = activate();
    expect(activation.services?.["llm.route.pi-ai"]).toMatchObject({ PiAiAdapter: expect.any(Function), PiAiWireEngine: expect.any(Function) });
    await activation.dispose();
  });
});

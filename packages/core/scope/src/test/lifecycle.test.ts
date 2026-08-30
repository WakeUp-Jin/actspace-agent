import { describe, expect, it } from "vitest";
import { activate } from "../plugin.js";

describe("core scope plugin lifecycle", () => {
  it("publishes the scope behavior entry and disposes", async () => {
    const activation = activate();
    expect(activation.services?.["core.scope"]).toMatchObject({ AgentScope: expect.any(Function) });
    await activation.dispose();
  });
});

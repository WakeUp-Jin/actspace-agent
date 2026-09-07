import { describe, expect, it } from "vitest";
import { activate } from "../plugin.js";

describe("subagent plugin lifecycle", () => {
  it("publishes the one-shot subagent behavior entry and disposes", async () => {
    const activation = activate();
    expect(activation.services?.["subagent.one-shot"]).toMatchObject({ OneShotSubagentProvider: expect.any(Function) });
    await activation.dispose();
  });
});

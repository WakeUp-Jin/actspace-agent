import { describe, expect, it } from "vitest";
import { activate } from "../plugin.js";

describe("browser tools plugin", () => {
  it("publishes browser registration behavior", async () => {
    const activation = activate();
    expect(activation.services?.["tools.browser"]).toMatchObject({ registerBrowserTools: expect.any(Function) });
    await activation.dispose();
  });
});

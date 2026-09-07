import { describe, expect, it } from "vitest";
import { activate, apply, LLM_HOST_PORT_ID } from "../plugin.js";
import { CordisContextClass } from "@actspace/cordis-adapter";
import { LlmRuntimeService } from "../service.js";
import type { LlmStreamEvent } from "../stream.js";

describe("LLM service plugin", () => {
  it("publishes route and service constructors and disposes", async () => {
    const activation = activate();
    expect(activation.services?.["llm.service"]).toMatchObject({ LlmService: expect.any(Function), LlmRouteRegistry: expect.any(Function) });
    await activation.dispose();
  });

  it("owns routes through a real Cordis Service and releases provider registrations with the fiber", async () => {
    const ctx = new CordisContextClass();
    const host = {
      credentials: { resolve: async () => ({ apiKey: "test" }) },
      routes: [{ routeId: "test", providerId: "fixture", modelPattern: "*", credentialRef: "fixture", defaults: {}, adapter: { adapterVersion: "fixture", dispatch: async function* (): AsyncIterable<LlmStreamEvent> { yield { type: "done", stopReason: "stop", usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, content: [] }; } } }],
    };
    ctx.provide(LLM_HOST_PORT_ID, host);
    await ctx.plugin({ apply: (inner) => apply(inner as never) });
    const service = ctx.get("llm.service");
    expect(service).toBeInstanceOf(LlmRuntimeService);
    expect((service as LlmRuntimeService).routes.list()).toHaveLength(1);
    await ctx.fiber.dispose();
    expect(ctx.get("llm.service")).toBeUndefined();
  });
});

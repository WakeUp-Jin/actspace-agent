import { CordisContextClass } from "@actspace/cordis-adapter";
import { SANDBOX_SERVICE_ID } from "@actspace/sandbox/types";
import { manifest } from "../manifest.js";
import { apply } from "../plugin.js";
import { HARNESS_EVALUATION_HOST_PORT_ID, HARNESS_EVALUATION_SERVICE_ID, type HarnessEvaluationService } from "../types.js";
import { fakeHost, fakeSandbox } from "./fakes.js";

describe("harness-evaluation plugin lifecycle", () => {
  it("needs the sandbox service, and reports itself unavailable without the Host port", async () => {
    expect(manifest.behaviors[0]).toMatchObject({ entryId: "harness-evaluation", provides: [HARNESS_EVALUATION_SERVICE_ID], injects: [SANDBOX_SERVICE_ID], optionalInjects: [HARNESS_EVALUATION_HOST_PORT_ID] });
    const ctx = new CordisContextClass();
    expect(() => apply(ctx as never)).toThrow(SANDBOX_SERVICE_ID);
    ctx.provide(SANDBOX_SERVICE_ID, fakeSandbox(async () => "hang"));
    await ctx.plugin({ inject: [SANDBOX_SERVICE_ID], apply: inner => apply(inner as never) });
    const service = ctx.get(HARNESS_EVALUATION_SERVICE_ID) as HarnessEvaluationService;
    expect(await service.status()).toEqual({ available: false, reasons: [`This Host does not provide ${HARNESS_EVALUATION_HOST_PORT_ID}.`] });
    await ctx.fiber.dispose();
    expect(ctx.get(HARNESS_EVALUATION_SERVICE_ID)).toBeUndefined();
  });

  it("is available with the Host port and an available evaluation sandbox", async () => {
    const ctx = new CordisContextClass();
    ctx.provide(SANDBOX_SERVICE_ID, fakeSandbox(async () => "hang"));
    ctx.provide(HARNESS_EVALUATION_HOST_PORT_ID, fakeHost("/nowhere"));
    await ctx.plugin({ inject: [SANDBOX_SERVICE_ID, HARNESS_EVALUATION_HOST_PORT_ID], apply: inner => apply(inner as never) });
    expect(await (ctx.get(HARNESS_EVALUATION_SERVICE_ID) as HarnessEvaluationService).status()).toEqual({ available: true, reasons: [] });
    await ctx.fiber.dispose();
  });
});

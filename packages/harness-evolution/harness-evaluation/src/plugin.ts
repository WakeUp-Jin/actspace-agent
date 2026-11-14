import { getService, provideService, type CordisContext } from "@actspace/cordis-adapter";
import { SANDBOX_SERVICE, SANDBOX_SERVICE_ID } from "@actspace/sandbox/types";
import { createHarnessEvaluationService } from "./service.js";
import { HARNESS_EVALUATION_HOST_PORT, HARNESS_EVALUATION_SERVICE } from "./types.js";

export function apply(ctx: CordisContext): void {
  const sandbox = getService(ctx, SANDBOX_SERVICE);
  if (!sandbox) throw new Error(`harness-evaluation requires ${SANDBOX_SERVICE_ID}.`);
  const host = getService(ctx, HARNESS_EVALUATION_HOST_PORT);
  provideService(ctx, HARNESS_EVALUATION_SERVICE, createHarnessEvaluationService({ sandbox, host }));
}

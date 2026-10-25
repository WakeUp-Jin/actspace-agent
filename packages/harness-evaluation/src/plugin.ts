import type { CordisContext } from "@actspace/cordis-adapter";
import { SANDBOX_SERVICE_ID, type SandboxService } from "@actspace/sandbox/types";
import { createHarnessEvaluationService } from "./service.js";
import { HARNESS_EVALUATION_HOST_PORT_ID, HARNESS_EVALUATION_SERVICE_ID, type HarnessEvaluationHostPort } from "./types.js";

export function apply(ctx: CordisContext): void {
  const sandbox = ctx.get?.(SANDBOX_SERVICE_ID) as SandboxService | undefined;
  if (!sandbox) throw new Error(`harness-evaluation requires ${SANDBOX_SERVICE_ID}.`);
  const host = ctx.get?.(HARNESS_EVALUATION_HOST_PORT_ID) as HarnessEvaluationHostPort | undefined;
  ctx.provide?.(HARNESS_EVALUATION_SERVICE_ID, createHarnessEvaluationService({ sandbox, host }));
}

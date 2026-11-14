import { getService, type CordisContext } from "@actspace/cordis-adapter";
import { SANDBOX_HOST_PORT, SANDBOX_HOST_PORT_ID, SANDBOX_SERVICE, SANDBOX_SERVICE_ID } from "@actspace/sandbox/types";
import { createNonoBackend } from "./backend.js";

export function apply(ctx: CordisContext): void {
  const sandbox = getService(ctx, SANDBOX_SERVICE);
  const host = getService(ctx, SANDBOX_HOST_PORT);
  if (!sandbox || !host) throw new Error(`sandbox-nono requires ${SANDBOX_SERVICE_ID} and ${SANDBOX_HOST_PORT_ID}.`);
  ctx.effect?.(() => sandbox.register(createNonoBackend(host)), "sandbox-nono");
}

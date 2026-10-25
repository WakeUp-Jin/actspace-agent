import type { CordisContext } from "@actspace/cordis-adapter";
import { SANDBOX_HOST_PORT_ID, SANDBOX_SERVICE_ID, type SandboxHostPort, type SandboxService } from "@actspace/sandbox/types";
import { createSeatbeltBackend } from "./backend.js";

export function apply(ctx: CordisContext): void {
  const sandbox = ctx.get?.(SANDBOX_SERVICE_ID) as SandboxService | undefined;
  const host = ctx.get?.(SANDBOX_HOST_PORT_ID) as SandboxHostPort | undefined;
  if (!sandbox || !host) throw new Error(`sandbox-seatbelt requires ${SANDBOX_SERVICE_ID} and ${SANDBOX_HOST_PORT_ID}.`);
  ctx.effect?.(() => sandbox.register(createSeatbeltBackend(host)), "sandbox-seatbelt");
}

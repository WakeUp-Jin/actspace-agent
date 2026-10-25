import type { CordisContext } from "@actspace/cordis-adapter";
import { createSandboxService } from "./service.js";
import { SANDBOX_HOST_PORT_ID, SANDBOX_SERVICE_ID, type SandboxHostPort, type SandboxManagerConfig } from "./types.js";

/** Backends register themselves; removing this plugin leaves shell-tools without a sandbox, which routes Bash to approval. */
export function apply(ctx: CordisContext, config?: SandboxManagerConfig): void {
  // Inherited mode used to be plugin config; a candidate composition must not be able to switch the sandbox off.
  if (config && Object.keys(config).length) throw new Error(`sandbox takes no configuration (got ${Object.keys(config).join(", ")}); inherited mode comes from ${SANDBOX_HOST_PORT_ID}.`);
  const host = ctx.get?.(SANDBOX_HOST_PORT_ID) as SandboxHostPort | undefined;
  if (!host) throw new Error(`sandbox requires ${SANDBOX_HOST_PORT_ID}.`);
  ctx.provide?.(SANDBOX_SERVICE_ID, createSandboxService({ host }));
}

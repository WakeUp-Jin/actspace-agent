import { getService, provideService, type CordisContext } from "@actspace/cordis-adapter";
import { createSandboxService } from "./service.js";
import { SANDBOX_HOST_PORT, SANDBOX_HOST_PORT_ID, SANDBOX_SERVICE, type SandboxManagerConfig } from "./types.js";

/** Backends register themselves; removing this plugin leaves shell-tools without a sandbox, which routes Bash to approval. */
export function apply(ctx: CordisContext, config?: SandboxManagerConfig): void {
  // Inherited mode used to be plugin config; a candidate composition must not be able to switch the sandbox off.
  if (config && Object.keys(config).length)
    throw new Error(
      `sandbox takes no configuration (got ${Object.keys(config).join(", ")}); inherited mode comes from ${SANDBOX_HOST_PORT_ID}.`,
    );
  const host = getService(ctx, SANDBOX_HOST_PORT);
  if (!host) throw new Error(`sandbox requires ${SANDBOX_HOST_PORT_ID}.`);
  provideService(ctx, SANDBOX_SERVICE, createSandboxService({ host }));
}

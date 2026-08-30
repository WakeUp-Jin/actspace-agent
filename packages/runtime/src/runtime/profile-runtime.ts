import type { BootRuntimeOptions, BootedRuntimeProfile } from "./boot.js";
import { bootRuntime } from "./boot.js";

/**
 * Process-local Profile result used by migrated Hosts. Domain operations are
 * resolved from the settled Context; this object only carries bootstrap facts
 * and the one shutdown boundary for the current process.
 */
export type { BootedRuntimeProfile } from "./boot.js";

export async function bootProfileRuntime(options: BootRuntimeOptions): Promise<BootedRuntimeProfile> {
  return bootRuntime(options);
}

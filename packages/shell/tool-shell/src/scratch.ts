import { join } from "node:path";

/** Where a Session's temporary scripts go; exported to Bash as `ACTSPACE_SCRATCH` and told to the model by the prompt. */
export function sessionScratchDirectory(scratchRoot: string, sessionId: string): string {
  return join(scratchRoot, "scripts", sessionId);
}

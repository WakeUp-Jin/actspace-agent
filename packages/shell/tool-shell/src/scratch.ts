import { join } from "node:path";

/** Where a Session's temporary scripts go; exported to Bash as `ACTSPACE_SCRATCH` and told to the model by the prompt. */
export function sessionScratchDirectory(scratchRoot: string, sessionId: string): string {
  return join(scratchRoot, "scripts", sessionId);
}

/**
 * Which Session's scratch directory a Session works in: its own, unless it shares another's. A forked subagent shares
 * its parent's, because it inherits the parent's conversation and system prompt and both name that path.
 */
export class ScratchOwners {
  readonly #owners = new Map<string, string>();
  readonly ownerOf = (sessionId: string): string => this.#owners.get(sessionId) ?? sessionId;
  share(sessionId: string, ownerSessionId: string): () => void {
    this.#owners.set(sessionId, this.ownerOf(ownerSessionId));
    return () => {
      this.#owners.delete(sessionId);
    };
  }
}

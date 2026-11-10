import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { isPathWithin } from "./file-resource.js";

/** Harness service id of {@link HostWritableRoots}. */
export const HOST_WRITABLE_ROOTS_SERVICE_ID = "actspace.host-writable-roots";

/**
 * Directories outside the workspace that the Host created for agents and cleans up itself
 * (the Bash scratch directory), so reads and writes inside them need no scope approval.
 * Deletes are not covered: the Host owns the cleanup. Only Host code adds roots here.
 */
export class HostWritableRoots {
  readonly #roots = new Set<string>();
  add(root: string): void { this.#roots.add(canonical(root)); }
  has(canonicalPath: string): boolean {
    for (const root of this.#roots) if (isPathWithin(root, canonicalPath)) return true;
    return false;
  }
  remove(root: string): void { this.#roots.delete(canonical(root)); }
}

function canonical(path: string): string {
  try { return realpathSync(path); } catch { return resolve(path); }
}

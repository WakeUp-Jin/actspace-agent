import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { serviceKey } from "@actspace/cordis-adapter";

/** Harness service id of {@link HostReadableFiles}. */
export const HOST_READABLE_FILES_SERVICE_ID = "actspace.host-readable-files";

/**
 * Exact files outside the workspace that agents may read without a scope approval
 * (e.g. an external subagent's native session record). Only files: a directory
 * added here does not open the files inside it.
 */
export class HostReadableFiles {
  readonly #paths = new Set<string>();
  add(path: string): void {
    this.#paths.add(canonical(path));
  }
  has(canonicalPath: string): boolean {
    return this.#paths.has(resolve(canonicalPath));
  }
  remove(path: string): void {
    this.#paths.delete(canonical(path));
  }
}

export const HOST_READABLE_FILES_SERVICE = serviceKey<HostReadableFiles>(HOST_READABLE_FILES_SERVICE_ID);

function canonical(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

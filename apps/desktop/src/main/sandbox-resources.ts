import { join } from "node:path";
import { findBundledNono, repoNonoPath } from "@actspace/sandbox";

/**
 * A packaged app only trusts the nono it ships with; development builds take `ACTSPACE_NONO_PATH` or the copy
 * `pnpm sandbox:fetch-nono` put under the repo. Undefined means no nono backend, never a lookup on PATH.
 */
export function resolveDesktopNonoPath(input: { readonly packaged: boolean; readonly resourcesPath: string; readonly repoRoot: string; readonly env: NodeJS.ProcessEnv }): string | undefined {
  return findBundledNono(input.packaged
    ? [join(input.resourcesPath, "app", "sandbox-components", "bin", "nono")]
    : [input.env.ACTSPACE_NONO_PATH, repoNonoPath(input.repoRoot)]);
}

import { fileURLToPath } from "node:url";

/** Absolute path to the Runtime-owned trusted Cordis composition. */
export function runtimeCordisConfigPath(): string {
  return fileURLToPath(new URL("../cordis.yml", import.meta.url));
}

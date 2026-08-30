import { homedir } from "node:os";
import { resolve } from "node:path";
import { resolveActSpaceDataRoot as resolveSharedActSpaceDataRoot } from "@actspace/shared";

export function resolveRuntimeV2DataRoot(explicit: string | undefined, env: NodeJS.ProcessEnv = process.env): string {
  return resolveSharedActSpaceDataRoot({ explicit: explicit === undefined ? undefined : resolve(explicit), env, platform: process.platform === "darwin" || process.platform === "linux" || process.platform === "win32" ? process.platform : "other", homeDir: homedir() });
}

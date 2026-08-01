import { join, resolve } from "node:path";

export function runtimeAssetDirectory(input: {
  dataDir: string;
  version: string;
  platform?: NodeJS.Platform;
  arch?: string;
}): string {
  return join(
    resolve(input.dataDir),
    "runtime",
    safeSegment(input.version),
    `${safeSegment(input.platform ?? process.platform)}-${safeSegment(input.arch ?? process.arch)}`,
  );
}

export function ripgrepRuntimePath(input: {
  dataDir: string;
  version: string;
  platform?: NodeJS.Platform;
  arch?: string;
}): string {
  const platform = input.platform ?? process.platform;
  return join(runtimeAssetDirectory(input), platform === "win32" ? "rg.exe" : "rg");
}

function safeSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]/g, "-");
  if (!sanitized || sanitized === "." || sanitized === "..") {
    throw new Error(`Invalid runtime asset path segment: ${value}`);
  }
  return sanitized;
}

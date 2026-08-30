import path from "node:path";
import { fileURLToPath } from "node:url";

const RELEASE_SOURCE = "docs/releases/feature-release-notes.md" as const;

export function releaseSourcePath(): string {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDirectory, "../../../../../", RELEASE_SOURCE);
}

export function releaseSourceLabel(): typeof RELEASE_SOURCE {
  return RELEASE_SOURCE;
}

import path from "node:path";
import { fileURLToPath } from "node:url";

const ROADMAP_SOURCE = "docs/roadmap.md" as const;

export function roadmapSourcePath(): string {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDirectory, "../../../../../", ROADMAP_SOURCE);
}

export function roadmapSourceLabel(): typeof ROADMAP_SOURCE {
  return ROADMAP_SOURCE;
}

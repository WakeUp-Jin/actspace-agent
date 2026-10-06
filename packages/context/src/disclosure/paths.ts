import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ContextPathState } from "../types.js";

export type PathReference = Pick<ContextPathState, "path" | "description" | "history"> & { readonly owner: string };
export type DisclosureArtifact = { readonly artifactId: string; readonly mediaType: string; readonly size: number; readonly sha256: string };
export interface DisclosureHost {
  normalizeFile(sessionId: string, path: string): Promise<string | undefined>;
  historyPath(sessionId: string): Promise<string | undefined>;
  createIndex(sessionId: string, content: string): Promise<DisclosureArtifact>;
  resolveArtifact(sessionId: string, artifactId: string): Promise<{ path: string; mediaType: string }>;
}

/** Candidates are hints, never proof of a file. The Host validates each candidate. */
export function collectPathHints(value: RuntimeV2JsonValue): readonly string[] {
  const hints = new Set<string>();
  const walk = (item: RuntimeV2JsonValue): void => {
    if (typeof item === "string") {
      item = item.replace(/^\s*\d+\|/gm, " ");
      for (const match of item.matchAll(/(?:^|[\s"'`(])((?:\.{0,2}\/|[A-Za-z0-9_.-]+\/)[^\s"'`<>|]*[A-Za-z0-9_.-])/g)) hints.add(match[1]!.replace(/:\d+(?::\d+)?$/, ""));
      for (const match of item.matchAll(/(?:^|[\s"'`(])([A-Za-z0-9_-]+\.[A-Za-z][A-Za-z0-9_.-]*)(?=$|[\s"'`),:])/g)) hints.add(match[1]!);
      return;
    }
    if (Array.isArray(item)) { item.forEach(walk); return; }
    if (item && typeof item === "object") {
      const record = item as Readonly<Record<string, RuntimeV2JsonValue>>;
      if (record.type === "file-reference" && typeof record.relativePath === "string") hints.add(record.relativePath);
      Object.values(record).forEach(walk);
    }
  };
  walk(value);
  return [...hints];
}

export function referenceText(path: ContextPathState): string {
  return `${JSON.stringify(path.path)}${path.description ? ` — ${path.description}` : ""}${path.history ? ` (Session ${path.history.sessionId}; event seq: ${path.history.sourceEventSeqs.join(", ")}; seq is not a line number)` : ""}`;
}

import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ContextPathState, DisclosureArtifact } from "@actspace/context-engine";

export type { DisclosureArtifact, PathReference } from "@actspace/context-engine";
export interface DisclosureHost {
  normalizeFile(sessionId: string, path: string): Promise<string | undefined>;
  historyPath(sessionId: string): Promise<string | undefined>;
  createIndex(sessionId: string, content: string): Promise<DisclosureArtifact>;
  resolveArtifact(sessionId: string, artifactId: string): Promise<{ path: string; mediaType: string }>;
}

// 模型回放用的不透明字段（思考签名、provider replay 载荷）：base64 里的「/」会被当成路径。
const OPAQUE_KEYS: ReadonlySet<string> = new Set(["signature", "thinkingSignature", "replay", "redactedData", "encryptedContent"]);
// 单段超过文件系统上限的不可能是真实路径。
const MAX_SEGMENT_LENGTH = 255;
const plausiblePath = (hint: string) => hint.split("/").every(segment => segment.length <= MAX_SEGMENT_LENGTH);

/** Candidates are hints, never proof of a file. The Host validates each candidate. */
export function collectPathHints(value: RuntimeV2JsonValue): readonly string[] {
  const hints = new Set<string>();
  const add = (hint: string) => { if (plausiblePath(hint)) hints.add(hint); };
  const walk = (item: RuntimeV2JsonValue): void => {
    if (typeof item === "string") {
      item = item.replace(/^\s*\d+\|/gm, " ");
      for (const match of item.matchAll(/(?:^|[\s"'`(])((?:\.{0,2}\/|[A-Za-z0-9_.-]+\/)[^\s"'`<>|]*[A-Za-z0-9_.-])/g)) add(match[1].replace(/:\d+(?::\d+)?$/, ""));
      for (const match of item.matchAll(/(?:^|[\s"'`(])([A-Za-z0-9_-]+\.[A-Za-z][A-Za-z0-9_.-]*)(?=$|[\s"'`),:])/g)) add(match[1]);
      return;
    }
    if (Array.isArray(item)) { item.forEach(walk); return; }
    if (item && typeof item === "object") {
      const record = item as Readonly<Record<string, RuntimeV2JsonValue>>;
      if (record.type === "file-reference" && typeof record.relativePath === "string") add(record.relativePath);
      for (const [key, child] of Object.entries(record)) if (!OPAQUE_KEYS.has(key)) walk(child);
    }
  };
  walk(value);
  return [...hints];
}

export function referenceText(path: ContextPathState): string {
  return `${JSON.stringify(path.path)}${path.description ? ` — ${path.description}` : ""}${path.history ? ` (Session ${path.history.sessionId}; event seq: ${path.history.sourceEventSeqs.join(", ")}; seq is not a line number)` : ""}`;
}

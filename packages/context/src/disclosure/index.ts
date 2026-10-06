import { createHash } from "node:crypto";
import type { ContextPathState } from "../types.js";
import type { DisclosureArtifact, DisclosureHost } from "./paths.js";
import { referenceText } from "./paths.js";

export async function sleepingIndex(host: DisclosureHost, sessionId: string, paths: readonly ContextPathState[], previous: { index: DisclosureArtifact | null; indexDigest: string }) {
  const sleeping = paths.filter(path => path.visibility === "sleeping").sort((a, b) => a.id.localeCompare(b.id));
  const content = sleeping.length ? `# Sleeping context references\n\nRead a specific file when needed. Reading does not immediately change active membership.\n\n${sleeping.map(path => `- ${referenceText(path)}`).join("\n")}\n` : "";
  const indexDigest = createHash("sha256").update(`${sessionId}\0${content}`).digest("hex");
  if (previous.indexDigest === indexDigest) {
    if (!previous.index) return { index: null, indexDigest };
    try { await host.resolveArtifact(sessionId, previous.index.artifactId); return { index: previous.index, indexDigest: previous.indexDigest }; } catch { /* Rebuild a missing derived index. */ }
  }
  return { index: content ? await host.createIndex(sessionId, content) : null, indexDigest };
}

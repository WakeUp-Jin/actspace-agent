import { inspectJsonlSession, exportCanonicalJsonl } from "./jsonl-reader.js";
import { JsonlSessionWriter, encodeRows } from "./jsonl-writer.js";
import { resolveSessionWorkspaceRoot } from "./workspace.js";
import type { CordisContext } from "@actspace/cordis-adapter";

export function apply(ctx: CordisContext): void {
  ctx.provide?.("session.jsonl", Object.freeze({ inspectJsonlSession, exportCanonicalJsonl, JsonlSessionWriter, encodeRows, resolveSessionWorkspaceRoot }));
}

export function activate() {
  const service = Object.freeze({
    inspectJsonlSession,
    exportCanonicalJsonl,
    JsonlSessionWriter,
    encodeRows,
    resolveSessionWorkspaceRoot,
  });
  return { services: { "session.jsonl": service }, dispose: () => undefined };
}

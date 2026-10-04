import { validateFileReferences, validateResponseAnnotations, type FileReference, type ResponseAnnotationReference, type ComposerReferenceIssue } from "./composer-content";
import type { RuntimeV2SessionSnapshot, RuntimeV2SessionProjectionInput, RuntimeV2DesktopSessionProjection } from "./runtime-v2";

export type RunReferenceValidation = { ok: true; fileReferences: FileReference[]; responseAnnotations: ResponseAnnotationReference[] } | { ok: false; issue: ComposerReferenceIssue };
export interface ReferenceValidationPorts {
  inspectSession(sessionId: string): Promise<RuntimeV2SessionSnapshot>;
  readSessionProjection(input: RuntimeV2SessionProjectionInput): Promise<RuntimeV2DesktopSessionProjection>;
  resolveFile(workspace: string, path: string): Promise<{ ok: true } | { ok: false; code: "file_not_found" | "file_outside_workspace" | "not_a_file" }>;
}
/** Validate ownership before importing attachments or appending task events. */
export async function validateRunReferences(ports: ReferenceValidationPorts, input: { sessionId: string; fileReferences?: unknown; responseAnnotations?: unknown }): Promise<RunReferenceValidation> {
  const files = validateFileReferences(input.fileReferences);
  if (files.ok === false) return { ok: false, issue: files.issue };
  const annotations = validateResponseAnnotations(input.responseAnnotations);
  if (annotations.ok === false) return { ok: false, issue: annotations.issue };
  if (!files.value.length && !annotations.value.length) return { ok: true, fileReferences: [], responseAnnotations: [] };
  const snapshot = await ports.inspectSession(input.sessionId);
  if (files.value.length) {
    if (snapshot.agentForm === "chat") return { ok: false, issue: { code: "file_references_not_allowed", kind: "file" } };
    if (!snapshot.workspaceRoot) return { ok: false, issue: { code: "file_not_found", kind: "file", index: 0, relativePath: files.value[0]!.relativePath } };
    for (const [index, reference] of files.value.entries()) {
      const resolved = await ports.resolveFile(snapshot.workspaceRoot, reference.relativePath);
      if (resolved.ok === false) return { ok: false, issue: { code: resolved.code, kind: "file", index, relativePath: reference.relativePath } };
    }
  }
  for (const [index, annotation] of annotations.value.entries()) {
    const match = /^v2-(\d+)$/.exec(annotation.assistantMessageId);
    const seq = match ? Number(match[1]) : -1;
    if (!Number.isSafeInteger(seq) || seq < 0 || seq > snapshot.throughJournalSeq) return { ok: false, issue: { code: "annotation_source_missing", kind: "annotation", index } };
    const projection = await ports.readSessionProjection({ sessionId: input.sessionId, beforeSeq: seq + 1, maxWindowEvents: 1 });
    const event = projection.window.events.find(candidate => candidate.seq === seq);
    if (!event || event.surface?.node.kind !== "assistant" || !((event.type === "assistant/message" && event.surface.kind === "append") || (event.type === "surface/replaced" && event.surface.kind === "replace"))) return { ok: false, issue: { code: "annotation_source_missing", kind: "annotation", index } };
  }
  return { ok: true, fileReferences: files.value, responseAnnotations: annotations.value };
}

import type { RuntimeV2ArtifactRef } from "@actspace/shared/runtime-v2/projection";
import type { ToolArtifactRef } from "@actspace/tools-runtime";
import { redactProjectionText } from "./redaction.js";

export function projectArtifactRef(input: ToolArtifactRef & { readonly label?: string }): RuntimeV2ArtifactRef {
  return Object.freeze({
    artifactId: input.artifactId,
    kind: kindForMediaType(input.mediaType),
    label: redactProjectionText(input.label ?? input.artifactId, 160),
    mimeType: input.mediaType,
    sizeBytes: Number.isSafeInteger(input.size) && input.size >= 0 ? input.size : null,
    digest: input.sha256 || null,
    available: true,
  });
}

export function markArtifactUnavailable(input: RuntimeV2ArtifactRef): RuntimeV2ArtifactRef {
  return Object.freeze({ ...input, available: false });
}

export function projectUnknownArtifact(input: unknown): RuntimeV2ArtifactRef | null {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (typeof value.artifactId !== "string" || typeof value.mediaType !== "string") return null;
  return projectArtifactRef({
    artifactId: value.artifactId,
    mediaType: value.mediaType,
    size: typeof value.size === "number" ? value.size : 0,
    sha256: typeof value.sha256 === "string" ? value.sha256 : "",
    label: typeof value.label === "string" ? value.label : undefined,
  });
}

function kindForMediaType(mediaType: string): RuntimeV2ArtifactRef["kind"] {
  if (mediaType.startsWith("image/")) return "image";
  if (mediaType.includes("json")) return "json";
  if (mediaType.includes("diff")) return "diff";
  if (mediaType.includes("zip") || mediaType.includes("tar")) return "archive";
  return "file";
}

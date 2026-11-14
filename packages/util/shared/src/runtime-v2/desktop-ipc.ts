import type { RuntimeDiagnosticsSnapshot, RuntimeLiveEvent, RuntimeSessionSnapshot } from "./projection";
import type { RuntimeBootManifest, RuntimeStateView, RuntimeSessionListItem } from "./runtime";

export type RuntimeDesktopStatus = {
  readonly ready: boolean;
  readonly runtimeInstanceId: string | null;
  readonly error: string | null;
};
export type RuntimeDesktopSnapshot = {
  readonly kind: "desktop-runtime-snapshot";
  readonly schemaVersion: 1;
  readonly runtimeInstanceId: string;
  readonly cursor: number;
  readonly runtime: RuntimeStateView;
  readonly manifest: RuntimeBootManifest;
  readonly diagnostics: RuntimeDiagnosticsSnapshot;
  readonly sessions: readonly RuntimeSessionListItem[];
  readonly selectedSession: RuntimeSessionSnapshot | null;
  readonly workspaceRoot: string;
};
export type RuntimeForkSessionInput = { readonly parentSessionId: string; readonly newSessionId: string } & ({ readonly boundarySeq: number } | { readonly turnId: string });
export type RuntimeRequestRestartInput = { readonly reason: string; readonly source: string; readonly candidateDigest?: string };
export type RuntimeUpdateSessionMetadataInput = { readonly sessionId: string; readonly title?: string | null; readonly pinned?: boolean; readonly archived?: boolean };
export type RuntimeReadArtifactResult = { readonly artifactId: string; readonly mimeType: string; readonly bytesBase64: string };
export type RuntimeAttachmentRef = {
  readonly artifactId: string;
  readonly mimeType: string;
  readonly name: string;
  readonly sizeBytes: number;
  /** Decoded body for Chat text attachments. Persisted in the user/message content, not exposed as a filesystem capability. */
  readonly textContent?: string;
};
export type RuntimeApprovalDecisionInput =
  | { readonly requestId: string; readonly hostId?: string; readonly decision: "once" | "deny" }
  | { readonly requestId: string; readonly hostId?: string; readonly decision: "session"; readonly suggestionId: string };
export type RuntimeDesktopLiveEnvelope = {
  readonly event: RuntimeLiveEvent;
  readonly emittedAt: string;
};

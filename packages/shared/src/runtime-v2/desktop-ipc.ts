import type { CustomConnectionInput } from "../settings";
import type { RuntimeV2DiagnosticsSnapshot, RuntimeV2LiveEvent, RuntimeV2SessionSnapshot } from "./projection";
import type { RuntimeV2BootManifest, RuntimeV2RuntimeState, RuntimeV2SessionListItem } from "./runtime";

export type RuntimeV2DesktopStatus = {
  readonly ready: boolean;
  readonly runtimeInstanceId: string | null;
  readonly error: string | null;
};
export type RuntimeV2DesktopSnapshot = {
  readonly kind: "desktop-runtime-snapshot";
  readonly schemaVersion: 1;
  readonly runtimeInstanceId: string;
  readonly cursor: number;
  readonly runtime: RuntimeV2RuntimeState;
  readonly manifest: RuntimeV2BootManifest;
  readonly diagnostics: RuntimeV2DiagnosticsSnapshot;
  readonly sessions: readonly RuntimeV2SessionListItem[];
  readonly selectedSession: RuntimeV2SessionSnapshot | null;
  readonly workspaceRoot: string;
};
export type RuntimeV2ForkSessionInput = { readonly parentSessionId: string; readonly boundarySeq: number; readonly newSessionId: string };
export type RuntimeV2RequestRestartInput = { readonly reason: string; readonly source: string; readonly candidateDigest?: string };
export type RuntimeV2UpdateSessionMetadataInput = { readonly sessionId: string; readonly title?: string | null; readonly pinned?: boolean; readonly archived?: boolean };
export type RuntimeV2ReadArtifactResult = { readonly artifactId: string; readonly mimeType: string; readonly bytesBase64: string };
/** apiKey 留空表示保留原 Key。 */
export type RuntimeV2UpdateCustomConnectionInput = Omit<CustomConnectionInput, "apiKey"> & { readonly connectionId: string; readonly apiKey?: string };
export type RuntimeV2AttachmentRef = {
  readonly artifactId: string;
  readonly mimeType: string;
  readonly name: string;
  readonly sizeBytes: number;
  /** Decoded body for Chat text attachments. Persisted in the user/message content, not exposed as a filesystem capability. */
  readonly textContent?: string;
};
export type RuntimeV2ApprovalDecisionInput =
  | { readonly requestId: string; readonly hostId?: string; readonly decision: "once" | "deny" }
  | { readonly requestId: string; readonly hostId?: string; readonly decision: "session"; readonly suggestionId: string };
export type RuntimeV2DesktopLiveEnvelope = {
  readonly event: RuntimeV2LiveEvent;
  readonly emittedAt: string;
};
export type RuntimeV2LiveReplay = {
  readonly runtimeInstanceId: string;
  readonly afterCursor: number;
  readonly currentCursor: number;
  readonly gap: boolean;
  readonly events: readonly RuntimeV2DesktopLiveEnvelope[];
};

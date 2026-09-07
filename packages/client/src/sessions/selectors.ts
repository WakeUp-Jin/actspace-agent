import type { RuntimeV2ComposerProjection, RuntimeV2ProviderUsageProjection, RuntimeV2RequestContextEstimateProjection, RuntimeV2SessionMessage, RuntimeV2SessionSnapshot, RuntimeV2TrajectorySnapshot } from "@actspace/shared/runtime-v2";
import type { ClientLiveOverlay } from "./live-overlay.js";
import type { ClientSessionCell } from "./session-snapshot.js";

export function selectSessionSnapshot(cell: ClientSessionCell): RuntimeV2SessionSnapshot | null {
  return cell.snapshot;
}

export function selectSurfaceMessages(cell: ClientSessionCell): readonly RuntimeV2SessionMessage[] {
  return cell.snapshot?.messages ?? [];
}

export function selectLiveOverlay(overlay: ClientLiveOverlay | null): ClientLiveOverlay | null {
  return overlay;
}

export function selectComposerPhase(cell: ClientSessionCell): "blank" | "engaging" | "active" {
  const snapshot = cell.snapshot;
  if (snapshot === null) return "blank";
  if (snapshot.activity.activeTurnId !== null || snapshot.pendingInbox.length > 0) return "active";
  return snapshot.messages.length === 0 ? "blank" : "active";
}

export function selectTrajectory(cell: ClientSessionCell): RuntimeV2TrajectorySnapshot | null {
  const value = cell.projectionValues.trajectory;
  return value !== undefined && typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as RuntimeV2TrajectorySnapshot
    : null;
}

export function selectComposer(cell: ClientSessionCell): RuntimeV2ComposerProjection | null {
  return readProjection<RuntimeV2ComposerProjection>(cell, "composer");
}

export function selectProviderUsage(cell: ClientSessionCell): RuntimeV2ProviderUsageProjection | null {
  return readProjection<RuntimeV2ProviderUsageProjection>(cell, "providerUsage");
}

export function selectRequestContextEstimate(cell: ClientSessionCell): RuntimeV2RequestContextEstimateProjection | null {
  return readProjection<RuntimeV2RequestContextEstimateProjection>(cell, "requestContextEstimate");
}

function readProjection<T>(cell: ClientSessionCell, key: string): T | null {
  const value = cell.projectionValues[key];
  return value !== undefined && typeof value === "object" && value !== null && !Array.isArray(value) ? value as T : null;
}

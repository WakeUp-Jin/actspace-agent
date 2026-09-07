import type { SessionSurfaceView } from "@actspace/session-journal";
import type { CompactionPolicy } from "./policy.js";

export type CompactionRegion = { readonly start: number; readonly end: number };

export function chooseCompactionRegion(surface: SessionSurfaceView, policy: CompactionPolicy): CompactionRegion | null {
  if (surface.entries.length < policy.minimumRegionEntries) return null;
  const end = Math.max(policy.minimumRegionEntries, surface.entries.length - 1);
  return Object.freeze({ start: 0, end });
}

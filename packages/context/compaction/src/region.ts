import type { SessionSurfaceView } from "@actspace/session-journal";
import type { CompactionPolicy } from "./policy.js";

export type CompactionRegion = { readonly start: number; readonly end: number };

export function chooseCompactionRegion(surface: SessionSurfaceView, policy: CompactionPolicy): CompactionRegion | null {
  if (surface.entries.length < policy.minimumRegionEntries) return null;
  let end = Math.max(policy.minimumRegionEntries, surface.entries.length - 1);
  // A result belongs to the preceding assistant batch. Keep the whole group.
  while (end > 0 && surface.entries[end]?.node.kind === "tool-result") end--;
  if (end < policy.minimumRegionEntries) return null;
  return Object.freeze({ start: 0, end });
}

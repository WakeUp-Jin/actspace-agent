import type { RuntimeV2DesktopSessionProjection, RuntimeV2SessionObservation, RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";
import { remoteSessionKey } from "./session-router";
/** Rewrite projection identities only. User content and tool arguments are opaque data. */
export function desktopRemoteObservation(hostId: string, value: RuntimeV2SessionObservation): RuntimeV2SessionObservation {
  const key = remoteSessionKey({ hostId, sessionId: value.sessionId });
  return { ...value, sessionId: key, snapshot: remoteSnapshot(hostId, value.snapshot), projection: { ...value.projection, sessionId: key },
    ...(value.window ? { window: { ...value.window, events: value.window.events.map(event => ({ ...event, sessionId: key })) } } : {}),
  };
}
export function desktopRemotePage(hostId: string, value: RuntimeV2SessionObservation): RuntimeV2DesktopSessionProjection {
  const observation = desktopRemoteObservation(hostId, value);
  if (!observation.window) throw new Error("Host omitted session history window");
  return { kind: "session-projection", schemaVersion: 1, sessionId: observation.sessionId, throughJournalSeq: observation.projection.throughJournalSeq,
    snapshot: observation.snapshot, values: observation.projection.values, window: observation.window, activeMessageIds: observation.activeMessageIds, deferredToolCalls: observation.deferredToolCalls, watermarks: observation.watermarks };
}
function remoteSnapshot(hostId: string, snapshot: RuntimeV2SessionSnapshot): RuntimeV2SessionSnapshot {
  const sessionId = remoteSessionKey({ hostId, sessionId: snapshot.sessionId });
  return { ...snapshot, sessionId, sessionGrants: snapshot.sessionGrants.map(grant => ({ ...grant, sessionId })) };
}

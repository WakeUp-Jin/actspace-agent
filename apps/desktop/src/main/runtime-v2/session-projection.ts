import type { SessionEventEnvelopeV1 } from '@actspace/session-journal';
import { projectComposer, projectProviderUsage, projectRequestContextEstimate, projectTrajectoryWindow } from '@actspace/session-projection';
import type { RuntimeV2DesktopSessionProjection, RuntimeV2SessionProjectionInput, RuntimeV2SessionSnapshot } from '@actspace/shared/runtime-v2';

/** Pin every value to the surface revision even when the running Journal advances during reads. */
export async function loadDesktopSessionProjection(reader: {
  browseSession?: (sessionId: string) => Promise<import("@actspace/desktop-app").DesktopBrowsePage>;
  inspectSession(sessionId: string): Promise<RuntimeV2SessionSnapshot>;
  inspectSessionEvents(sessionId: string): Promise<readonly SessionEventEnvelopeV1[]>;
}, input: RuntimeV2SessionProjectionInput): Promise<RuntimeV2DesktopSessionProjection> {
  const page = !input.includeTrajectory && reader.browseSession ? await reader.browseSession(input.sessionId).catch(error => {
    // Streaming can advance the Journal before a browse cache can be published.
    // Read a revision-pinned snapshot rather than leaving Context on an old request.
    if (error instanceof Error && error.message === 'Session changed while preparing history; retry.') return undefined;
    throw error;
  }) : undefined;
  const snapshot = page?.snapshot ?? await reader.inspectSession(input.sessionId);
  if (snapshot.sessionId !== input.sessionId) throw new Error('Session projection identity mismatch.');
  const observed = page?.journal ?? await reader.inspectSessionEvents(input.sessionId);
  const journal = observed.filter(e => e.seq <= snapshot.throughJournalSeq);
  if (!page && (journal.at(-1)?.seq ?? -1) !== snapshot.throughJournalSeq) throw new Error('Session Journal does not cover the snapshot revision.');
  return {
    kind: 'session-projection', schemaVersion: 1, sessionId: snapshot.sessionId,
    throughJournalSeq: snapshot.throughJournalSeq, snapshot,
    values: {
      providerUsage: projectProviderUsage(snapshot),
      requestContextEstimate: projectRequestContextEstimate(snapshot, journal),
      composer: projectComposer(snapshot),
      ...(input.includeTrajectory ? { trajectory: projectTrajectoryWindow(snapshot.sessionId, journal, input.trajectoryFromSeq) } : {}),
    },
  };
}

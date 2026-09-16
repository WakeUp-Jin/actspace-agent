// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { SessionJournal, createCoreCodecRegistry } from '@actspace/session-journal';
import type { RuntimeV2SessionSnapshot } from '@actspace/shared/runtime-v2';
import { loadDesktopSessionProjection } from '../runtime-v2/session-projection';
import { observeSessionRevisions } from '../runtime-v2/session-revision-observer';

function snapshot(revision: number): RuntimeV2SessionSnapshot {
  return { kind: 'session-snapshot', schemaVersion: 1, sessionId: 's', throughJournalSeq: revision, createdAt: '', updatedAt: '', workspaceRoot: null, accessState: 'read-write', metadata: { title: null, pinned: false, archived: false }, messages: [], tools: [], pendingInbox: [], todos: [], delegations: [], lineage: null, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: null }, activity: { turnCount: 0, completedTurnCount: 0, stepCount: 0, activeTurnId: null, activeStepId: null, compactionCount: 0, activeCompactionId: null, lastCompactionSummary: null } };
}

describe('desktop trajectory projection transport', () => {
  it('refreshes current request context when streaming prevents browse cache publication', async () => {
    const request = { seq: 0, type: 'request/context', time: '', data: { requestId: 'live', snapshot: { prepared: { contextWindow: 1000000 }, messages: [{ role: 'user', content: '中'.repeat(12000) }] } } };
    const reader = {
      browseSession: vi.fn(async () => { throw new Error('Session changed while preparing history; retry.'); }),
      inspectSession: vi.fn(async () => snapshot(0)),
      inspectSessionEvents: vi.fn(async () => [request] as unknown as import('@actspace/session-journal').SessionEventEnvelopeV1[]),
    };
    const result = await loadDesktopSessionProjection(reader, { sessionId: 's' });
    expect(result.values.requestContextEstimate).toMatchObject({ requestId: 'live', totalEstimatedTokens: 12000 });
    reader.browseSession.mockRejectedValueOnce(new Error('unrelated failure'));
    await expect(loadDesktopSessionProjection(reader, { sessionId: 's' })).rejects.toThrow('unrelated failure');
  });

  it('pins a moving Journal to the captured surface revision and rejects incomplete reads', async () => {
    const journal = new SessionJournal({ registry: createCoreCodecRegistry() });
    const source = { ownerPluginId: '@actspace/core' };
    journal.append({ type: 'turn/start', eventVersion: 1, source, data: { turnId: 't' }, surface: null });
    const captured = snapshot(0);
    journal.append({ type: 'turn/end', eventVersion: 1, source, data: { turnId: 't', status: 'completed' }, surface: null });
    const reader = { inspectSession: async () => captured, inspectSessionEvents: async () => journal.events };
    const result = await loadDesktopSessionProjection(reader, { sessionId: 's', includeTrajectory: true });
    expect(result.values.trajectory).toMatchObject({ throughJournalSeq: 0, nodes: [{ eventSeq: 0 }] });
    expect(Object.values(result.values).map(value => (value as { throughJournalSeq: number }).throughJournalSeq)).toEqual([0, 0, 0, 0]);
    await expect(loadDesktopSessionProjection({ ...reader, inspectSessionEvents: async () => [] }, { sessionId: 's' })).rejects.toThrow('does not cover');
    await expect(loadDesktopSessionProjection(reader, { sessionId: 'wrong' })).rejects.toThrow('identity mismatch');
  });

  it('coalesces actual committed event revisions by Session and releases its listener', () => {
    vi.useFakeTimers();
    let listener!: (this: { sessionId: string }, event: { seq: number }) => void;
    const unsubscribe = vi.fn();
    const publish = vi.fn();
    const stop = observeSessionRevisions({ on: (_name, callback) => { listener = callback as typeof listener; return unsubscribe; } }, publish);
    listener.call({ sessionId: 's' }, { seq: 2 }); listener.call({ sessionId: 's' }, { seq: 4 }); listener.call({ sessionId: 'other' }, { seq: 1 });
    vi.advanceTimersByTime(40);
    expect(publish.mock.calls).toEqual([['s', 4, false], ['other', 1, false]]);
    listener.call({ sessionId: 's' }, { seq: 5 }); stop(); vi.runAllTimers();
    expect(publish).toHaveBeenCalledTimes(2); expect(unsubscribe).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

it('receives the real Cordis session carrier after a SessionJournal commit', async () => {
  const { CordisContextClass, emitContained } = await import('../../../../../packages/cordis-adapter/src/index');
  const context = new CordisContextClass();
  const publish = vi.fn();
  const stop = observeSessionRevisions(context, publish);
  const journal = new SessionJournal({ registry: createCoreCodecRegistry() });
  const event = journal.append({ type: 'turn/start', eventVersion: 1, source: { ownerPluginId: '@actspace/core' }, data: { turnId: 't' }, surface: null });
  await emitContained(context, 'session/event', event, { sessionId: 'committed' });
  await new Promise(resolve => setTimeout(resolve, 60));
  expect(publish).toHaveBeenCalledWith('committed', 0, false);
  stop();
});

it('uses only the bounded page for ordinary chat and never produces trajectory', async () => {
  const captured = snapshot(500);
  const reader = { browseSession: vi.fn(async () => ({ snapshot: captured, journal: [], history: { before: 400, throughJournalSeq: 500 } })), inspectSession: vi.fn(), inspectSessionEvents: vi.fn() };
  const result = await loadDesktopSessionProjection(reader, { sessionId: 's' });
  expect(result.values.trajectory).toBeUndefined();
  expect(reader.browseSession).toHaveBeenCalledWith('s');
  expect(reader.inspectSession).not.toHaveBeenCalled();
  expect(reader.inspectSessionEvents).not.toHaveBeenCalled();
});

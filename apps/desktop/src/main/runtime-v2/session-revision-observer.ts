import type { BootedRuntimeProfile } from '@actspace/runtime';
import type { SessionEventEnvelopeV1 } from '@actspace/session-journal';

/** Journal commit notifications, coalesced per Session to avoid one IPC read per token. */
export function observeSessionRevisions(context: BootedRuntimeProfile['context'], publish: (sessionId: string, seq: number) => void): () => void {
  const pending = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = context.on?.('session/event', function (this: { sessionId?: string } | undefined, event: SessionEventEnvelopeV1) {
    const sessionId = this?.sessionId;
    if (!sessionId || !Number.isSafeInteger(event.seq)) return;
    pending.set(sessionId, Math.max(event.seq, pending.get(sessionId) ?? -1));
    timer ??= setTimeout(() => {
      timer = undefined;
      const revisions = [...pending]; pending.clear();
      for (const [id, seq] of revisions) publish(id, seq);
    }, 40);
  });
  return () => { if (typeof unsubscribe === 'function') unsubscribe(); clearTimeout(timer); pending.clear(); };
}

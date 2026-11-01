import { SessionDurabilityFailure } from "./errors.js";

export type SessionCheckpointBarrier =
  | "before-llm-dispatch"
  | "before-tool-body"
  | "before-next-step"
  | "before-shutdown-publication";

export interface SessionCheckpointTarget {
  readonly lastSeq: number;
  flush(throughSeq?: number): Promise<void>;
}

export class CheckpointPolicy {
  async enforce(target: SessionCheckpointTarget, barrier: SessionCheckpointBarrier): Promise<void> {
    const throughSeq = target.lastSeq;
    try {
      await target.flush(throughSeq);
    } catch (error) {
      throw new SessionDurabilityFailure(barrier, throughSeq, error);
    }
  }
}

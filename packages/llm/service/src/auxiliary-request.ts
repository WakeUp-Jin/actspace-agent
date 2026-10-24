import type { LlmUsage } from "./usage.js";

/** Request facts belong to the Session owner. Tools never write Journal events. */
export type AuxiliaryRequestOwner = {
  readonly sessionId: string;
  readonly purpose: "session-title";
} | {
  readonly sessionId: string;
  readonly purpose: "compaction";
  readonly turnId?: string;
} | {
  readonly sessionId: string;
  readonly agentRunId: string;
  readonly turnId: string;
  readonly stepId: string;
  readonly callId: string;
  readonly purpose: "image-inspection" | "auto-review";
};
export type AuxiliaryRequestStart = AuxiliaryRequestOwner & {
  readonly logicalRequestId: string;
  /** The prepared LLM request ID, unique for each dispatch attempt. */
  readonly attemptId: string;
  readonly attempt: number;
  readonly routeId: string;
  readonly model: string;
};
export type AuxiliaryRequestEnd = {
  readonly status: "completed" | "failed" | "aborted";
  readonly usage: LlmUsage;
};
export type AuxiliaryRequestAttempt = {
  /** Resolves only after the terminal fact is durable; repeated calls share that outcome. */
  readonly finish: (result: AuxiliaryRequestEnd) => Promise<void>;
};
export type AuxiliaryRequestRecorder = {
  /** Resolves only after the start fact is durable. A rejection prohibits dispatch. */
  readonly start: (input: AuxiliaryRequestStart) => Promise<AuxiliaryRequestAttempt>;
};

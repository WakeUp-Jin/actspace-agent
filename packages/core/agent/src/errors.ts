export type AgentErrorCode = "AGENT_CONFLICT" | "AGENT_NOT_FOUND" | "AGENT_SETUP_FAILED" | "TURN_ALREADY_ACTIVE" | "TURN_ABORTED" | "STEP_LIMIT" | "PUBLICATION_FAILED";

export class AgentRuntimeError extends Error {
  constructor(readonly code: AgentErrorCode, message: string, cause?: unknown) { super(message, { cause }); this.name = "AgentRuntimeError"; }
}

export type AgentTerminationReason = "completed" | "aborted" | "failed" | "step-limit" | "concludes-turn";
export type RunTurnResult = { readonly agentRunId: string; readonly turnId: string; readonly reason: AgentTerminationReason; readonly steps: number; readonly finalText: string };

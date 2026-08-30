export type AgentDescriptor = {
  readonly id: string;
  readonly version: number;
  readonly kind: "main" | "subagent";
  readonly description: string;
  readonly presetId: string;
  readonly routeId: string;
  readonly model: string;
  readonly maxSteps: number;
};

export const MAIN_AGENT_DESCRIPTOR: AgentDescriptor = Object.freeze({ id: "actspace.main", version: 1, kind: "main", description: "ActSpace main Agent", presetId: "actspace.main", routeId: "default", model: "default", maxSteps: 32 });

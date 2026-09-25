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

export { MAIN_AGENT_PRESETS } from "./main-preset.js";
import { MAIN_AGENT_PRESETS } from "./main-preset.js";
export const MAIN_AGENT_DESCRIPTOR: AgentDescriptor = MAIN_AGENT_PRESETS["actspace.main"].descriptor;

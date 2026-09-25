import type { MainAgentPresetId } from "@actspace/shared/runtime-v2";
import type { AgentDescriptor } from "./descriptor.js";

export type MainAgentPreset = {
  readonly id: MainAgentPresetId;
  readonly descriptor: AgentDescriptor;
  readonly promptProfile: "agent" | "chat";
  readonly allowedToolNames: "all-except-web" | readonly ["web", "generate_image"];
};

const MAIN_DESCRIPTOR: AgentDescriptor = Object.freeze({ id: "actspace.main", version: 1, kind: "main", description: "ActSpace main Agent", presetId: "actspace.main", routeId: "default", model: "default", maxSteps: 32 });
const CHAT_DESCRIPTOR: AgentDescriptor = Object.freeze({ id: "actspace.chat", version: 1, kind: "main", description: "ActSpace Chat", presetId: "actspace.chat", routeId: "default", model: "default", maxSteps: 32 });

export const MAIN_AGENT_PRESETS: Readonly<Record<MainAgentPresetId, MainAgentPreset>> = Object.freeze({
  "actspace.main": Object.freeze({ id: "actspace.main", descriptor: MAIN_DESCRIPTOR, promptProfile: "agent", allowedToolNames: "all-except-web" }),
  "actspace.chat": Object.freeze({ id: "actspace.chat", descriptor: CHAT_DESCRIPTOR, promptProfile: "chat", allowedToolNames: Object.freeze(["web", "generate_image"] as const) }),
});

export function resolveMainAgentPreset(presetId?: string): MainAgentPreset {
  if (presetId === undefined) return MAIN_AGENT_PRESETS["actspace.main"];
  const preset = MAIN_AGENT_PRESETS[presetId as MainAgentPresetId];
  if (preset === undefined) throw new Error(`Unsupported main Agent preset ${presetId}.`);
  return preset;
}

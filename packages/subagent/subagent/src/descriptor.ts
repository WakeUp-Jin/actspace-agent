export type SubagentDescriptor = {
  readonly id: "actspace.agent" | "actspace.explore";
  readonly version: 1;
  readonly description: string;
  readonly presetId: string;
};

export const AGENT_SUBAGENT_DESCRIPTOR: SubagentDescriptor = Object.freeze({ id: "actspace.agent", version: 1, description: "Run a bounded read-only analysis child Agent.", presetId: "actspace.agent" });
export const EXPLORE_SUBAGENT_DESCRIPTOR: SubagentDescriptor = Object.freeze({ id: "actspace.explore", version: 1, description: "Explore code and information with read-only tools.", presetId: "actspace.explore" });

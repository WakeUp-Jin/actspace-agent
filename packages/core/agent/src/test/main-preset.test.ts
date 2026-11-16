import { describe, expect, it } from "vitest";
import { MAIN_AGENT_PRESETS, resolveMainAgentPreset } from "../main-preset.js";

describe("main Agent presets", () => {
  it("defaults old Sessions to Agent and gives Chat two fixed tools plus the optional deep_search", () => {
    expect(resolveMainAgentPreset()).toBe(MAIN_AGENT_PRESETS["actspace.main"]);
    expect(resolveMainAgentPreset("actspace.chat")).toMatchObject({
      id: "actspace.chat",
      promptProfile: "chat",
      allowedToolNames: ["web", "generate_image", "deep_search"],
    });
  });

  it("fails closed for unknown main presets", () => {
    expect(() => resolveMainAgentPreset("actspace.unknown")).toThrow("Unsupported main Agent preset");
  });
});

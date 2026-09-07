import { describe, expect, it } from "vitest";
import { manifest } from "../manifest.js";
import { apply } from "../plugin.js";

describe("desktop app plugin", () => {
  it("declares a real Desktop application behavior", () => {
    expect(manifest.pluginId).toBe("actspace.desktop-app");
    expect(manifest.behaviors[0]?.entryId).toBe("desktop.app");
    expect(manifest.contributions.services).toContain("desktop.app");
    expect(typeof apply).toBe("function");
  });
});

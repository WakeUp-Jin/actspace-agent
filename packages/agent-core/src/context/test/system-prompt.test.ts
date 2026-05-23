import { describe, it, expect } from "vitest";
import { SystemPromptContext } from "../modules/system-prompt";

describe("SystemPromptContext", () => {
  it("should initialize with core segment", () => {
    const spc = new SystemPromptContext("You are actspace.");
    const segments = spc.getAllSegments();

    expect(segments.length).toBe(1);
    expect(segments[0].id).toBe("core");
    expect(segments[0].content).toBe("You are actspace.");
    expect(segments[0].enabled).toBe(true);
    expect(segments[0].priority).toBe(100);
  });

  it("should register additional segments", () => {
    const spc = new SystemPromptContext("Core prompt");
    spc.registerSegment({ id: "rules", content: "Follow rules", priority: 50 });
    spc.registerSegment({ id: "tools", content: "Available tools", priority: 30 });

    expect(spc.getAllSegments().length).toBe(3);
    expect(spc.getSegment("rules")?.content).toBe("Follow rules");
  });

  it("should not allow overriding core segment", () => {
    const spc = new SystemPromptContext("Core prompt");
    spc.registerSegment({ id: "core", content: "Replaced", priority: 200 });

    expect(spc.getSegment("core")?.content).toBe("Core prompt");
  });

  it("should sort by priority descending in getPrompt", () => {
    const spc = new SystemPromptContext("Core (100)");
    spc.registerSegment({ id: "high", content: "High (90)", priority: 90 });
    spc.registerSegment({ id: "low", content: "Low (10)", priority: 10 });

    const prompt = spc.getPrompt();
    const coreIdx = prompt.indexOf("Core (100)");
    const highIdx = prompt.indexOf("High (90)");
    const lowIdx = prompt.indexOf("Low (10)");

    expect(coreIdx).toBeLessThan(highIdx);
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it("should exclude disabled segments", () => {
    const spc = new SystemPromptContext("Core");
    spc.registerSegment({ id: "extra", content: "Extra", priority: 50 });
    spc.disableSegment("extra");

    const prompt = spc.getPrompt();
    expect(prompt).toContain("Core");
    expect(prompt).not.toContain("Extra");
  });

  it("should not allow disabling core segment", () => {
    const spc = new SystemPromptContext("Core");
    spc.disableSegment("core");

    expect(spc.getSegment("core")?.enabled).toBe(true);
  });

  it("should not allow removing core segment", () => {
    const spc = new SystemPromptContext("Core");
    spc.removeSegment("core");

    expect(spc.getSegment("core")).toBeDefined();
  });

  it("should update segment content", () => {
    const spc = new SystemPromptContext("Core");
    spc.registerSegment({ id: "dynamic", content: "v1", priority: 50 });
    spc.updateSegment("dynamic", "v2");

    expect(spc.getSegment("dynamic")?.content).toBe("v2");
  });

  it("format() should return SystemPart with rendered XML", () => {
    const spc = new SystemPromptContext("You are actspace.");
    const parts = spc.format();

    expect(parts.systemParts.length).toBe(1);
    expect(parts.systemParts[0].tag).toBe("system_prompt");
    const rendered = parts.systemParts[0].render();
    expect(rendered).toContain("You are actspace.");
    expect(rendered).toContain("<system_prompt");
  });
});

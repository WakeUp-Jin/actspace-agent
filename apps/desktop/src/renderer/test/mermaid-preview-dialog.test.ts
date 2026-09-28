import { describe, expect, it } from "vitest";
import { fitZoom, stepZoom } from "../components/messages/MermaidPreviewDialog";

describe("Mermaid preview zoom", () => {
  it("fits large diagrams into the viewport but never upscales small ones", () => {
    expect(fitZoom({ width: 1048, height: 848 }, { width: 400, height: 200 })).toBe(1);
    expect(fitZoom({ width: 1048, height: 848 }, { width: 2000, height: 400 })).toBeCloseTo(0.5);
    expect(fitZoom({ width: 0, height: 0 }, { width: 2000, height: 400 })).toBe(1);
  });

  it("steps through preset levels with the fit level included", () => {
    expect(stepZoom(1, 1, 1)).toBe(1.1);
    expect(stepZoom(1, -1, 1)).toBe(0.9);
    expect(stepZoom(0.42, 1, 0.42)).toBe(0.5);
    expect(stepZoom(0.5, -1, 0.42)).toBe(0.42);
    expect(stepZoom(0.12, -1, 0.12)).toBe(0.12);
    expect(stepZoom(5, 1, 1)).toBe(5);
  });
});

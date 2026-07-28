import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rendererRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Tool log shimmer color semantics", () => {
  it("uses neutral theme text for running copy and its moving highlight", () => {
    const baseCss = fs.readFileSync(path.join(rendererRoot, "styles/base.css"), "utf8");
    const shimmerStart = baseCss.indexOf(".tool-log-text-running {");
    const shimmerEnd = baseCss.indexOf("@keyframes compact-progress", shimmerStart);
    expect(shimmerStart).toBeGreaterThanOrEqual(0);
    expect(shimmerEnd).toBeGreaterThan(shimmerStart);
    const shimmerCss = baseCss.slice(shimmerStart, shimmerEnd);

    expect(shimmerCss).toContain("color: var(--act-color-text);");
    expect(shimmerCss).toContain("var(--act-color-text-subtle) 50%");
    expect(shimmerCss).not.toContain("var(--act-color-operational)");
    expect(shimmerCss).toContain("display: none;");
  });
});

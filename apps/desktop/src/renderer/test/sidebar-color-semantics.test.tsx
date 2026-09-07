import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rendererRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(rendererRoot, "components/Sidebar.tsx"), "utf8");

describe("Sidebar color semantics", () => {
  it("keeps selected rows neutral while status dots use operational, warning, and danger roles", () => {
    expect(source).toContain('SIDEBAR_PRIMARY_ACTION_ACTIVE_CLASS = "bg-selected font-semibold text-text-main"');
    expect(source).toContain('SESSION_ROW_ACTIVE_CLASS = "is-active bg-sidebar-selected"');
    expect(source).toContain("bg-operational");
    expect(source).toContain("bg-warning");
    expect(source).toContain("bg-danger");
    expect(source).not.toMatch(new RegExp(["br", "and"].join(""), "i"));
  });

  it("uses the neutral focus contract for rename input", () => {
    expect(source).toContain("border-focus-ring");
    expect(source).toContain("ring-focus-ring/20");
  });
});

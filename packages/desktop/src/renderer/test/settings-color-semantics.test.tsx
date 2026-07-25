import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rendererRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(rendererRoot, relativePath), "utf8");
}

describe("Settings color semantics", () => {
  it("maps primary actions, toggles, selected options, and focus to distinct roles", () => {
    const page = read("components/settings/SettingsPage.tsx");
    const primitives = read("components/settings/SettingsPrimitives.tsx");
    const nav = read("components/settings/SettingsNav.tsx");

    expect(page).toContain("bg-action");
    expect(primitives).toContain('checked ? "bg-operational"');
    expect(primitives).toContain("bg-selected font-semibold text-text-main");
    expect(primitives).toContain("focus-visible:ring-focus-ring/20");
    expect(nav).toContain("bg-selected font-semibold text-text-main");
  });

  it("contains no legacy color consumers", () => {
    const settingsSource = [
      read("components/settings/SettingsPage.tsx"),
      read("components/settings/SettingsPrimitives.tsx"),
      read("components/settings/SettingsNav.tsx"),
      read("components/settings/KairosSettings.tsx"),
    ].join("\n");

    const legacyHue = new RegExp(["br", "and"].join(""), "i");
    const legacyTemperature = new RegExp(["wa", "rm"].join(""), "i");
    expect(settingsSource).not.toMatch(legacyHue);
    expect(settingsSource).not.toMatch(legacyTemperature);
  });
});

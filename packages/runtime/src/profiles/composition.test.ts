import { describe, expect, it } from "vitest";
import { DESKTOP_APP_BUNDLE } from "@actspace/desktop-app";
import { createProfileComposition, RUNTIME_PROFILE_IDS, TRUSTED_LOADER_ENTRIES } from "./composition.js";

const host = {
  hostKind: "desktop" as const,
  capabilityCeiling: ["filesystem.read", "filesystem.write", "network", "approval", "credential", "renderer", "process"] as const,
  runtimeContract: "actspace.runtime.v2",
  invocationId: "composition-test",
};

describe("runtime profile composition", () => {
  it("keeps headless and desktop bundles distinct", () => {
    const headless = createProfileComposition(RUNTIME_PROFILE_IDS.headless, { ...host, hostKind: "cli-run" });
    const desktop = createProfileComposition(RUNTIME_PROFILE_IDS.desktop, host, { appBundle: DESKTOP_APP_BUNDLE });
    expect(headless.profileId).toBe(RUNTIME_PROFILE_IDS.headless);
    expect(desktop.profileId).toBe(RUNTIME_PROFILE_IDS.desktop);
    expect(headless.digest).not.toBe(desktop.digest);
    expect(headless.manifests.some((manifest) => manifest.pluginId === "actspace.headless")).toBe(true);
    expect(desktop.manifests.some((manifest) => manifest.pluginId === "actspace.desktop-app")).toBe(true);
  });

  it("uses the checked-in loader transport for every profile", () => {
    const composition = createProfileComposition(RUNTIME_PROFILE_IDS.desktop, host, { appBundle: DESKTOP_APP_BUNDLE });
    expect(composition.loaderConfig).toEqual({ profileId: RUNTIME_PROFILE_IDS.desktop, entries: TRUSTED_LOADER_ENTRIES });
  });
});

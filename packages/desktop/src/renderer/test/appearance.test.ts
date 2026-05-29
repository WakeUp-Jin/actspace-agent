import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyAppearance } from "../appearance/apply";
import { loadAppearance, saveAppearance } from "../appearance/storage";
import { DEFAULT_APPEARANCE, type AppearancePrefs } from "../appearance/types";

const STORAGE_KEY = "actspace.appearance.v1";

describe("appearance storage", () => {
  beforeEach(() => localStorage.clear());

  it("returns defaults when nothing is stored", () => {
    expect(loadAppearance()).toEqual(DEFAULT_APPEARANCE);
  });

  it("falls back to defaults on malformed JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadAppearance()).toEqual(DEFAULT_APPEARANCE);
  });

  it("clamps out-of-range numbers and rejects unknown font ids", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, uiFontId: "bogus", codeFontId: "bogus", uiFontSize: 99, codeFontSize: 99 }),
    );
    const prefs = loadAppearance();
    expect(prefs.uiFontId).toBe("system");
    expect(prefs.codeFontId).toBe("system-mono");
    expect(prefs.uiFontSize).toBe(20);
    expect(prefs.codeFontSize).toBe(18);
  });

  it("round-trips saved preferences", () => {
    const prefs: AppearancePrefs = {
      version: 1,
      uiFontId: "serif-reading",
      codeFontId: "jetbrains",
      uiFontSize: 16,
      codeFontSize: 15,
    };
    saveAppearance(prefs);
    expect(loadAppearance()).toEqual(prefs);
  });
});

describe("applyAppearance", () => {
  afterEach(() => {
    delete (window as { actspace?: unknown }).actspace;
  });

  it("writes css vars, maps UI font size to zoom, and compensates code size", () => {
    const root = document.createElement("div");
    const setUiZoom = vi.fn();
    (window as { actspace?: unknown }).actspace = { setUiZoom };

    // uiFontSize 21 / base 14 = zoom 1.5；代码 15px 预除以 1.5 = 10px，渲染后恰为 15px。
    applyAppearance(
      { version: 1, uiFontId: "serif-reading", codeFontId: "jetbrains", uiFontSize: 21, codeFontSize: 15 },
      root,
    );

    expect(root.style.getPropertyValue("--act-font-ui")).toContain("Georgia");
    expect(root.style.getPropertyValue("--act-font-mono")).toContain("JetBrains");
    expect(root.style.getPropertyValue("--act-font-mono-size")).toBe("10px");
    expect(setUiZoom).toHaveBeenCalledWith(1.5);
  });

  it("does not zoom and keeps literal code size when the bridge is absent (browser mock)", () => {
    const root = document.createElement("div");
    expect(() => applyAppearance({ ...DEFAULT_APPEARANCE }, root)).not.toThrow();
    expect(root.style.getPropertyValue("--act-font-mono-size")).toBe("13px");
  });
});

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

  it("clamps out-of-range numbers, rejects unknown font ids, and falls back theme to system", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        theme: "bogus",
        accentPalette: "bogus",
        uiFontId: "bogus",
        codeFontId: "bogus",
        uiFontSize: 99,
        codeFontSize: 99,
      }),
    );
    const prefs = loadAppearance();
    expect(prefs.theme).toBe("system");
    expect(prefs.accentPalette).toBe("default");
    expect(prefs.uiFontId).toBe("system");
    expect(prefs.codeFontId).toBe("system-mono");
    expect(prefs.uiFontSize).toBe(20);
    expect(prefs.codeFontSize).toBe(18);
  });

  it("falls back to the codex Mermaid theme for older records and unknown ids", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, theme: "dark" }));
    expect(loadAppearance()).toMatchObject({ theme: "dark", mermaidTheme: "codex" });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, mermaidTheme: "neon" }));
    expect(loadAppearance().mermaidTheme).toBe("codex");
  });

  it("defaults the accent palette for preferences saved before it existed", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, theme: "dark", uiFontId: "system", codeFontId: "fira", uiFontSize: 14, codeFontSize: 13 }),
    );
    const prefs = loadAppearance();
    expect(prefs.accentPalette).toBe("default");
    expect(prefs.theme).toBe("dark");
    expect(prefs.codeFontId).toBe("fira");
  });

  it("falls back to the default palette for retired prototype ids", () => {
    for (const legacy of ["actspace", "codex-blue", "maka-dusk"]) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, accentPalette: legacy }));
      expect(loadAppearance().accentPalette).toBe("default");
    }
  });

  it("round-trips saved preferences", () => {
    const prefs: AppearancePrefs = {
      version: 1,
      theme: "dark",
      accentPalette: "purple",
      uiFontId: "serif-reading",
      codeFontId: "jetbrains",
      uiFontSize: 16,
      codeFontSize: 15,
      mermaidTheme: "codex",
    };
    saveAppearance(prefs);
    expect(loadAppearance()).toEqual(prefs);
  });
});

describe("applyAppearance", () => {
  afterEach(() => {
    delete (window as { actspace?: unknown }).actspace;
  });

  it("writes data-theme, css vars, maps UI font size to zoom, and compensates code size", () => {
    const root = document.createElement("div");
    const setUiZoom = vi.fn();
    const setNativeTheme = vi.fn();
    (window as { actspace?: unknown }).actspace = { setUiZoom, setNativeTheme };

    // uiFontSize 21 / base 14 = zoom 1.5；代码 15px 预除以 1.5 = 10px，渲染后恰为 15px。
    applyAppearance(
      {
        version: 1,
        theme: "dark",
        accentPalette: "blue",
        uiFontId: "serif-reading",
        codeFontId: "jetbrains",
        uiFontSize: 21,
        codeFontSize: 15,
        mermaidTheme: "codex",
      },
      root,
    );

    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(root.getAttribute("data-accent")).toBe("blue");
    expect(setNativeTheme).toHaveBeenCalledWith("dark");
    expect(root.style.getPropertyValue("--act-font-ui")).toContain("Georgia");
    expect(root.style.getPropertyValue("--act-font-mono")).toContain("JetBrains");
    expect(root.style.getPropertyValue("--act-font-mono-size")).toBe("10px");
    expect(setUiZoom).toHaveBeenCalledWith(1.5);
  });

  it("does not zoom and keeps literal code size when the bridge is absent (browser mock)", () => {
    const root = document.createElement("div");
    expect(() => applyAppearance({ ...DEFAULT_APPEARANCE }, root)).not.toThrow();
    expect(root.getAttribute("data-theme")).toBe("system");
    expect(root.getAttribute("data-accent")).toBe("default");
    expect(root.style.getPropertyValue("--act-font-mono-size")).toBe("13px");
  });
});

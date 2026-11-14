// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
  app: {},
  BrowserWindow: class {},
}));
import { sanitizeExternalSubagentSettings } from "@actspace/shared";
import { disabledPluginIds, resolvePluginSettings, resolvePluginSwitches } from "../plugins/plugin-switches";
import { listPluginItems, unavailablePluginReasons } from "../plugins/plugins-ipc";
import { disabledBrowserBridgeStatus, disabledEnglishLearningState } from "../plugins/optional-plugin-stubs";

const display = (canDisable: boolean, defaultEnabled: boolean, scope: "global" | "session" = "session") => ({
  title: "t",
  description: "d",
  scope,
  defaultEnabled,
  canDisable,
});
const catalog = [
  {
    id: "english-learning",
    directory: "english-learning",
    loaders: ["host", "harness"],
    manifest: { display: display(true, false, "global") },
  },
  { id: "browser-tools", directory: "browser", loaders: ["harness"], manifest: { display: display(true, false) } },
  { id: "shell-tools", directory: "shell", loaders: ["harness"], manifest: { display: display(false, true) } },
  { id: "llm-service", directory: "llm", loaders: ["host", "harness"], manifest: { display: display(false, true) } },
  { id: "llm-service", directory: "llm", loaders: ["harness"], manifest: { display: display(false, true) } },
  { id: "desktop-app", directory: "host", loaders: ["host"], manifest: { display: display(false, true, "global") } },
  { id: "agent-host", directory: "host", loaders: ["host"], manifest: { display: display(false, true, "global") } },
] as never[];

describe("plugin switches", () => {
  it("defaults switchable plugins to their defaultEnabled and ignores settings for built-ins", () => {
    const off = resolvePluginSwitches({ tools: {} }, catalog);
    expect(off.get("browser-tools")).toBe(false);
    expect(off.get("english-learning")).toBe(false);
    expect(off.get("shell-tools")).toBe(true);
    const on = resolvePluginSwitches({ tools: { plugins: { "browser-tools": true, "shell-tools": false } } }, catalog);
    expect(on.get("browser-tools")).toBe(true);
    expect(on.get("shell-tools")).toBe(true);
    expect(disabledPluginIds(off)).toEqual(["english-learning", "browser-tools"]);
  });

  it("lists each plugin once, hides other forms' host entries and separates loaded from enabled", () => {
    const startup = resolvePluginSwitches({ tools: {} }, catalog);
    const items = listPluginItems({
      catalog,
      startupSwitches: startup,
      settings: { tools: { plugins: { "browser-tools": true } } },
    });
    expect(items.map((item) => item.id)).toEqual([
      "english-learning",
      "browser-tools",
      "shell-tools",
      "llm-service",
      "desktop-app",
    ]);
    const browser = items.find((item) => item.id === "browser-tools");
    expect(browser).toMatchObject({ canDisable: true, loaded: false, enabled: true, scope: "session" });
    expect(items.find((item) => item.id === "llm-service")!.scope).toBe("global");
    expect(items.find((item) => item.id === "shell-tools")).toMatchObject({
      canDisable: false,
      loaded: true,
      enabled: true,
    });
  });

  it("reports disabled stub states", () => {
    expect(disabledBrowserBridgeStatus()).toMatchObject({ runState: "disabled", enabled: false });
    expect(disabledEnglishLearningState()).toMatchObject({ enabled: false });
  });
});

describe("external subagent plugins", () => {
  const subagentCatalog = [
    { id: "subagent-codex", directory: "subagent", loaders: ["harness"], manifest: { display: display(true, false) } },
    {
      id: "subagent-claude-code",
      directory: "subagent",
      loaders: ["harness"],
      manifest: { display: display(true, false) },
    },
  ] as never[];

  it("fills defaults and drops unknown stored values", () => {
    expect(resolvePluginSettings({ tools: {} })).toEqual({
      "subagent-codex": { approvalPolicy: "never", sandbox: "workspace-write" },
      "subagent-claude-code": { permissionMode: "dontAsk" },
    });
    const stored = {
      tools: {
        externalSubagents: {
          codex: { approvalPolicy: "on-request", sandbox: "nope" },
          claudeCode: { permissionMode: "plan" },
        },
      },
    } as never;
    expect(resolvePluginSettings(stored)).toEqual({
      "subagent-codex": { approvalPolicy: "on-request", sandbox: "workspace-write" },
      "subagent-claude-code": { permissionMode: "plan" },
    });
  });

  it("sanitizes the stored shape", () => {
    expect(sanitizeExternalSubagentSettings(undefined)).toBeUndefined();
    expect(sanitizeExternalSubagentSettings({ codex: { sandbox: 1 }, claudeCode: "x" })).toBeUndefined();
    expect(sanitizeExternalSubagentSettings({ codex: { sandbox: "read-only", extra: 1 } })).toEqual({
      codex: { sandbox: "read-only" },
    });
  });

  it("lists unavailable reasons from the command lookup, current settings and the restart hint", async () => {
    const unavailable = await unavailablePluginReasons(subagentCatalog, async (command) =>
      command === "codex" ? "/usr/local/bin/codex" : undefined,
    );
    expect([...unavailable]).toEqual([["subagent-claude-code", "本机没有找到 claude 命令"]]);
    const startupSettings = { tools: {} };
    const startup = resolvePluginSwitches(startupSettings, subagentCatalog);
    const items = listPluginItems({
      catalog: subagentCatalog,
      startupSwitches: startup,
      settings: { tools: { externalSubagents: { codex: { sandbox: "read-only" } } } },
      startupPluginSettings: resolvePluginSettings(startupSettings),
      unavailable,
    });
    const codex = items.find((item) => item.id === "subagent-codex")!;
    expect(codex).toMatchObject({
      settings: { approvalPolicy: "never", sandbox: "read-only" },
      settingsPendingRestart: true,
    });
    expect(codex.unavailableReason).toBeUndefined();
    const claude = items.find((item) => item.id === "subagent-claude-code");
    expect(claude).toMatchObject({
      unavailableReason: "本机没有找到 claude 命令",
      settings: { permissionMode: "dontAsk" },
      settingsPendingRestart: false,
    });
  });

  it("treats a failing lookup as not installed", async () => {
    const reasons = await unavailablePluginReasons(subagentCatalog, async () => {
      throw new Error("boom");
    });
    expect([...reasons.keys()]).toEqual(["subagent-codex", "subagent-claude-code"]);
  });
});

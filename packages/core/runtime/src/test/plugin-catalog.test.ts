import { describe, expect, it } from "vitest";
import { DEFAULT_HARNESS_ENTRIES } from "../harness/default-harness-definition.js";
import { TRUSTED_LOADER_ENTRIES } from "../profiles/composition.js";
import { PLUGIN_CATALOG, PLUGIN_PACKAGES_OUTSIDE_DEFAULT, pluginCatalogEntry } from "../plugin-catalog.js";

const behavior = (id: string) => pluginCatalogEntry(id)!.manifest.behaviors[0]!;

/**
 * These derivations replaced hand-written tables. The expected values below were first asserted
 * against the old tables (`TRUSTED_LOADER_ENTRIES`, `DEFAULT_HARNESS_ENTRIES`,
 * and the entry-to-module map) and are kept as the pinned shape of the default composition.
 */
describe("plugin catalog", () => {
  it("derives the Host loader entries from the manifests (id, name, inject)", () => {
    const hostRows = PLUGIN_CATALOG.filter(entry => entry.loaders.includes("host"));
    expect(TRUSTED_LOADER_ENTRIES.map(entry => entry.id)).toEqual([
      "actspace-runtime", "session-journal", "session-persistence", "session-jsonl", "session-projection", "session-runtime", "session-checkpoint-policy",
      "llm-service", "todo-projection", "core-agent", "agent-runtime", "headless-runner", "agent-host", "desktop-app", "english-learning", "side-chat", "session-transcript",
    ]);
    expect(TRUSTED_LOADER_ENTRIES).toEqual(hostRows.map(entry => ({ id: entry.id, name: entry.module, inject: [...(behavior(entry.id).injects ?? [])] })));
    expect(TRUSTED_LOADER_ENTRIES).toContainEqual({ id: "todo-projection", name: "@actspace/tool-todo/projection", inject: ["session.projection"] });
    expect(TRUSTED_LOADER_ENTRIES).toContainEqual({ id: "session-runtime", name: "@actspace/runtime/session", inject: ["actspace.host.session", "session.journal", "session.store", "session.projection"] });
  });

  it("derives the default Harness rows from the manifests", () => {
    expect(DEFAULT_HARNESS_ENTRIES.map(row => row[0])).toEqual([
      "llm-service", "auto-review", "tools-approval", "sandbox", "sandbox-nono", "sandbox-seatbelt", "tools-runtime", "context-engine", "prompt-runtime",
      "context-system", "context-rules", "context-skills", "context-runtime", "context-conversation", "context-tools", "context-background-tasks",
      "context-disclosure", "compaction-runtime", "filesystem-read", "filesystem-search", "filesystem-write", "web-tools", "image-generation", "shell-tools",
      "image-inspection", "todo-tools", "browser-tools", "background-tasks", "subagent-tools", "plugin-manager", "agent-factory",
    ]);
    const rows = new Map(DEFAULT_HARNESS_ENTRIES.map(row => [row[0], row]));
    expect(rows.get("llm-service")).toEqual(["llm-service", ["llm.service", "llm.routes", "llm.service.types"], ["actspace.host.llm"]]);
    expect(rows.get("shell-tools")).toEqual(["shell-tools", ["tools.shell-tools"], ["tools.runtime", "actspace.host.tools.shell-tools", "actspace.host.background-tasks"], [{ id: "sandbox", fallback: "bash runs outside the sandbox after approval" }]]);
    expect(rows.get("todo-tools")).toEqual(["todo-tools", ["tools.todo"], ["tools.runtime", "session.runtime"]]);
    expect(rows.get("context-system")).toEqual(["context-system", ["context.source.system"], []]);
    expect(rows.get("agent-factory")![1]).toEqual(["actspace.agent.factory", "agent.run-factory"]);
  });

  it("uses package subpaths as load entries, with no build aliases", () => {
    expect(pluginCatalogEntry("agent-factory")!.module).toBe("@actspace/runtime/agent-factory");
    expect(pluginCatalogEntry("todo-tools")!.module).toBe("@actspace/tool-todo/plugin");
    expect(pluginCatalogEntry("todo-projection")!.module).toBe("@actspace/tool-todo/projection");
    for (const entry of PLUGIN_CATALOG) expect(entry.module, entry.id).toMatch(/^@actspace\/[a-z-]+\/[a-z-]+$/);
  });

  it("carries Harness behavior config in the manifest (only browser-tools has one)", () => {
    for (const entry of PLUGIN_CATALOG.filter(item => item.loaders.includes("harness"))) {
      expect(behavior(entry.id).config, entry.id).toEqual(entry.id === "browser-tools" ? { disposeHost: false } : {});
    }
  });

  it("registers codecs only where the manifest declares one", () => {
    for (const entry of PLUGIN_CATALOG) expect(entry.codec !== undefined, entry.id).toBe(entry.manifest.codecs.length > 0);
  });

  it("has unique ids, a display on every row consistent with its loaders, and unique outside-default packages", () => {
    expect(new Set(PLUGIN_CATALOG.map(entry => entry.id)).size).toBe(PLUGIN_CATALOG.length);
    for (const entry of PLUGIN_CATALOG) {
      expect(entry.manifest.display, entry.id).toBeDefined();
      expect(entry.manifest.display!.scope, entry.id).toBe(entry.loaders.includes("host") ? "global" : "session");
    }
    expect(new Set(PLUGIN_PACKAGES_OUTSIDE_DEFAULT.map(item => item.package)).size).toBe(PLUGIN_PACKAGES_OUTSIDE_DEFAULT.length);
  });

  it("only browser and english learning are off by default and can be disabled", () => {
    const optional = PLUGIN_CATALOG.filter(entry => entry.manifest.display!.canDisable).map(entry => entry.id);
    expect(optional).toEqual(["english-learning", "browser-tools"]);
    for (const id of optional) expect(pluginCatalogEntry(id)!.manifest.display!.defaultEnabled).toBe(false);
  });
});

import { expect, it } from "vitest";
import { CONTEXT_PLUGIN_PACKAGES, contextPluginPackage } from "../modules.js";

it("keeps the Context plugin package map explicit and owner separated", () => {
  expect(CONTEXT_PLUGIN_PACKAGES.map(entry => entry.id)).toEqual([
    "context-engine", "context-system", "context-runtime", "context-rules", "context-skills", "context-conversation", "context-background-tasks", "context-tools", "context-disclosure", "context-compaction",
  ]);
  expect(contextPluginPackage("context-engine")).toMatchObject({ role: "engine", owner: "actspace.context" });
  expect(new Set(CONTEXT_PLUGIN_PACKAGES.map(entry => entry.owner)).size).toBe(CONTEXT_PLUGIN_PACKAGES.length);
});

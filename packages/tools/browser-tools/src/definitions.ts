import type { ToolDefinition } from "@actspace/tools-runtime";
import { browserActionsByCategory } from "./generated-actions.js";
import { BROWSER_TOOLS_PLUGIN_ID } from "./manifest.js";

const tabId = { type: "integer", minimum: 0, description: "Target Chrome tab id." } as const;
const timeout = { type: "integer", minimum: 1, maximum: 120_000, description: "Optional timeout in milliseconds." } as const;
const selector = { type: "string", minLength: 1, description: "Compatibility CSS selector; prefer a structured target." } as const;
const frameTarget = Object.freeze({
  type: "object",
  properties: {
    kind: { type: "string", enum: ["css", "role", "text", "label", "placeholder", "test_id"] },
    value: text(), role: text(), name: text(), exact: { type: "boolean" },
  },
  required: ["kind"],
  additionalProperties: false,
});
const locatorTarget = Object.freeze({
  ...frameTarget,
  properties: { ...frameTarget.properties, frame_path: { type: "array", items: frameTarget } },
});

export const BROWSER_TOOL_DEFINITIONS: readonly ToolDefinition[] = Object.freeze([
  definition("browser_cua", "Perform coordinate-level Browser actions for screenshots, Canvas and other visual surfaces.", categorySchema("cua", {
    tab_id: tabId, x: number(), y: number(), scroll_x: number(), scroll_y: number(), text: text(), keys: strings(), path: { type: "array", items: { type: "object", additionalProperties: true } }, button: { type: "string", enum: ["left", "middle", "right"] },
  }, ["action", "tab_id"])),
  definition("browser_dom", "Inspect or operate on stable node ids from the current Browser DOM snapshot.", categorySchema("dom", {
    tab_id: tabId, node_id: text(), scroll_x: number(), scroll_y: number(), text: text(), keys: strings(), limit: { type: "integer", minimum: 1, maximum: 1_000 },
  }, ["action", "tab_id"])),
  definition("browser_locator", "Resolve or operate on a structured semantic Browser locator with automatic actionability checks.", categorySchema("locator", {
    tab_id: tabId, selector, target: locatorTarget, value: text(), replace: { type: "boolean" }, keys: strings(), modifiers: strings(), button: { type: "string", enum: ["left", "middle", "right"] }, checked: { type: "boolean" }, name: text(), state: { type: "string", enum: ["attached", "detached", "visible", "hidden"] }, selections: { type: "array", items: { type: "object", additionalProperties: true } }, relative_selector: selector, direction: { type: "string", enum: ["up", "down", "left", "right"] }, amount: number(), offset: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 1_000 }, x: number(), y: number(), crop_x: number(), crop_y: number(), crop_width: number(), crop_height: number(), include_non_interactable: { type: "boolean" }, timeout_ms: timeout,
  }, ["action", "tab_id"])),
  definition("browser_navigation", "Navigate the current Browser tab with goto, back, forward or reload.", categorySchema("navigation", { tab_id: tabId, url: { type: "string", pattern: "^https?://" }, timeout_ms: timeout }, ["action", "tab_id"])),
  definition("browser_tabs", "List and manage tabs owned by the current Agent Browser Session.", categorySchema("tabs", { tab_id: tabId, url: { type: "string", pattern: "^https?://" }, active: { type: "boolean" }, name: text(), keep: { type: "array", items: { type: "object", additionalProperties: true } } }, ["action"])),
  definition("browser_user", "Access explicitly approved surfaces from the user's real Chrome profile.", categorySchema("user", { tab_id: tabId, query: text(), limit: { type: "integer", minimum: 1, maximum: 1_000 }, from: text(), to: text() }, ["action"])),
  definition("browser_wait", "Wait for page load, URL, locator, file chooser or download state.", categorySchema("wait", { tab_id: tabId, state: text(), url: text(), selector, timeout_ms: timeout }, ["action", "tab_id"])),
  definition("browser_io", "Handle Browser file chooser, download and clipboard operations.", categorySchema("io", { tab_id: tabId, file_chooser_id: text(), files: strings(), download_id: text(), text: text(), items: { type: "array", items: { type: "object", additionalProperties: true } }, timeout_ms: timeout }, ["action", "tab_id"]), ["/files", "/text", "/items"]),
  definition("browser_debug", "Read bounded console and runtime diagnostics from a Browser tab.", categorySchema("debug", { tab_id: tabId, filter: text(), levels: strings(), limit: { type: "integer", minimum: 1, maximum: 1_000 } }, ["action", "tab_id"])),
  definition("browser_help", "List or describe the canonical Browser command registry before choosing an action.", objectSchema({ category: { type: "string", enum: Object.keys(browserActionsByCategory) }, action: text(), query: text() }), [], "read-only"),
  definition("browser_run", "Run a validated ordered batch of canonical Browser actions.", objectSchema({ actions: { type: "array", minItems: 1, maxItems: 100, items: { type: "object", properties: { category: { type: "string", enum: Object.keys(browserActionsByCategory) }, action: text(), params: { type: "object", additionalProperties: true } }, required: ["category", "action"], additionalProperties: false } }, stop_on_error: { type: "boolean", default: true } }, ["actions"]), ["/actions"]),
]);

function definition(localName: string, description: string, inputSchema: ToolDefinition["inputSchema"], sensitiveArgumentPaths: readonly string[] = [], concurrency: ToolDefinition["concurrency"] = "exclusive"): ToolDefinition {
  return Object.freeze({ abiVersion: 2, pluginId: BROWSER_TOOLS_PLUGIN_ID, name: localName, definitionVersion: 1, description, inputSchema, effects: [{ capabilityId: "browser", mode: "use" as const, resourceScope: "browser-session" }], concurrency, sensitiveArgumentPaths: ["/headers", "/cookies", "/token", "/password", ...sensitiveArgumentPaths], resultSchemaVersion: 1 });
}

function categorySchema(category: keyof typeof browserActionsByCategory, properties: Readonly<Record<string, unknown>>, required: readonly string[]): ToolDefinition["inputSchema"] {
  return objectSchema({ action: { type: "string", enum: browserActionsByCategory[category] }, ...properties }, required);
}
function objectSchema(properties: Readonly<Record<string, unknown>>, required: readonly string[] = []): ToolDefinition["inputSchema"] { return Object.freeze({ type: "object", properties, required, additionalProperties: false }); }
function text() { return Object.freeze({ type: "string", minLength: 1 }); }
function number() { return Object.freeze({ type: "number" }); }
function strings() { return Object.freeze({ type: "array", items: { type: "string" } }); }

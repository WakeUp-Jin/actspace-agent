import type { ToolRuntime } from "@actspace/tools-runtime";
import type { ToolBodyResult, ToolExecutionContext } from "@actspace/tools-runtime";
import { BROWSER_TOOL_DEFINITIONS } from "./definitions.js";
import { browserCommandMetadata } from "./generated-actions.js";
import type { BrowserCapability } from "./host-port.js";
import type { CordisContext } from "@actspace/cordis-adapter";

export const BROWSER_TOOLS_HOST_PORT_ID = "actspace.host.tools.browser" as const;

export function registerBrowserTools(runtime: ToolRuntime, browser: BrowserCapability): readonly ReturnType<ToolRuntime["register"]>[] {
  return Object.freeze(BROWSER_TOOL_DEFINITIONS.map((definition) => runtime.register({
    definition,
    executor: { concurrencySafe: definition.concurrency === "read-only", execute: commandExecutor(definition.name, browser) },
    policies: definition.name === "browser_help" ? [] : [browserPolicy(definition.name)],
  })));
}

function browserPolicy(name: string) {
  return Object.freeze({
    id: `${name}.canonical-policy`,
    layer: 100,
    order: 0,
    evaluate: ({ args }: { readonly args: Readonly<Record<string, import("@actspace/shared/runtime-v2").RuntimeV2JsonValue>> }) => {
      const commands = name === "browser_run" ? batchCommands(args.actions) : [singleCommand(name, args.action)];
      if (commands.some((command) => command === undefined)) return { kind: "deny" as const, code: "BROWSER_COMMAND_UNKNOWN", reason: "Browser command is not present in the canonical registry." };
      const resolved = commands.filter((command): command is (typeof browserCommandMetadata)[number] => command !== undefined);
      if (resolved.every((command) => command.readOnly)) return { kind: "continue" as const };
      const risk = resolved.some((command) => command.riskLevel === "high") ? "high" as const : "medium" as const;
      return { kind: "require-approval" as const, reason: `Allow ${resolved.map((command) => `${command.category}.${command.action}`).join(", ")}?`, risk };
    },
  });
}

function singleCommand(localName: string, action: import("@actspace/shared/runtime-v2").RuntimeV2JsonValue | undefined): (typeof browserCommandMetadata)[number] | undefined {
  const category = localName.replace(/^browser_/, "");
  return typeof action === "string" ? browserCommandMetadata.find((command) => command.category === category && command.action === action) : undefined;
}

function batchCommands(value: import("@actspace/shared/runtime-v2").RuntimeV2JsonValue | undefined): readonly ((typeof browserCommandMetadata)[number] | undefined)[] {
  if (!Array.isArray(value) || value.length === 0) return [undefined];
  return value.map((item) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return undefined;
    const record = item as Readonly<Record<string, import("@actspace/shared/runtime-v2").RuntimeV2JsonValue>>;
    return typeof record.category === "string" && typeof record.action === "string" ? browserCommandMetadata.find((command) => command.category === record.category && command.action === record.action) : undefined;
  });
}

type BrowserToolHandler = (args: Readonly<Record<string, import("@actspace/shared/runtime-v2").RuntimeV2JsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>;

function commandExecutor(name: string, browser: BrowserCapability): BrowserToolHandler {
  return async (args, context) => {
    if (!browser.ready) return { status: "failed", modelOutput: [{ type: "text", text: "Browser Bridge is unavailable." }], summary: "Browser unavailable", failure: { code: "BROWSER_UNAVAILABLE", message: "Browser Bridge is unavailable.", retryable: true } };
    return browser.command(name, args, context);
  };
}

export function apply(ctx: CordisContext): void {
  const runtime = ctx.get?.("tools.runtime") as ToolRuntime | undefined;
  const browser = ctx.get?.(BROWSER_TOOLS_HOST_PORT_ID) as BrowserCapability | undefined;
  if (runtime === undefined) throw new Error("Browser Tools plugin requires tools.runtime.");
  const registrations = browser?.ready ? registerBrowserTools(runtime, browser) : [];
  ctx.provide?.("tools.browser", Object.freeze({ available: browser?.ready === true, registrations, definitions: BROWSER_TOOL_DEFINITIONS }));
  ctx.effect?.(() => async () => {
    const results = await Promise.allSettled([...registrations].reverse().map((registration) => registration.dispose()));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length > 0) throw new AggregateError(failures.map((failure) => failure.reason), "Browser Tools cleanup failed.");
  }, "browser-tools");
}

export function activate() {
  return { services: { "tools.browser": Object.freeze({ registerBrowserTools, BROWSER_TOOL_DEFINITIONS }) }, dispose: () => undefined };
}

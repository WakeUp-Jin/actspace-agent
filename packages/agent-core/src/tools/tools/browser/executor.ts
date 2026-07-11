import { BridgeClient } from "./bridge-client";
import { browserDefinitions } from "./definition";
import { getBrowserApproval } from "./permissions";
import type {
  BridgeClientOptions,
  BrowserCommandAction,
  BrowserCommandExecutionResult,
  BrowserPreflightResult,
  BrowserRunResult,
  TabInfo,
} from "./types";
import type { ToolExecutorFn } from "../../types";

export type BrowserToolName = (typeof browserDefinitions)[number]["name"];

export interface BrowserToolExecutors {
  executors: Record<string, ToolExecutorFn>;
  preflight: (actions: BrowserCommandAction[]) => Promise<BrowserPreflightResult>;
  dispose: () => Promise<void>;
}

const CATEGORY_BY_TOOL: Record<string, string> = {
  browser_cua: "cua",
  browser_dom: "dom",
  browser_locator: "locator",
  browser_navigation: "navigation",
  browser_tabs: "tabs",
  browser_user: "user",
  browser_wait: "wait",
  browser_io: "io",
  browser_debug: "debug",
};

export function createBrowserToolExecutors(options: BridgeClientOptions): BrowserToolExecutors {
  const client = new BridgeClient(options);

  const preflight = async (actions: BrowserCommandAction[]): Promise<BrowserPreflightResult> => (
    await client.send("agent_browser_bridge.command.preflight", {
      actions,
      sessionId: options.sessionId,
      turnId: options.turnId,
    })
  ) as BrowserPreflightResult;

  const executors: Record<string, ToolExecutorFn> = {};
  for (const [toolName, category] of Object.entries(CATEGORY_BY_TOOL)) {
    executors[toolName] = async (args) => executeCategory(client, category, args);
  }

  executors.browser_help = async (args) => {
    const category = typeof args.category === "string" ? args.category : "";
    const action = typeof args.action === "string" ? args.action : "";
    const query = typeof args.query === "string" ? args.query.toLowerCase() : "";
    if (category && action) {
      const result = await client.send("agent_browser_bridge.command.describe", { category, action });
      return { success: true, data: truncate(JSON.stringify(result, null, 2), 16_000), structured: result };
    }
    const report = await client.send("agent_browser_bridge.command.list", {}) as {
      count: number;
      categories: string[];
      commands: Array<Record<string, unknown>>;
    };
    const commands = report.commands.filter((command) => {
      if (category && command.category !== category) return false;
      if (!query) return true;
      return JSON.stringify(command).toLowerCase().includes(query);
    });
    const result = { count: commands.length, categories: report.categories, commands };
    return { success: true, data: truncate(JSON.stringify(result, null, 2), 16_000), structured: result };
  };

  executors.browser_run = async (args) => {
    const actions = args.actions as BrowserCommandAction[];
    const result = (await client.send("agent_browser_bridge.command.run", {
      actions,
      stopOnError: args.stop_on_error !== false,
      approval: getBrowserApproval(args),
      sessionId: options.sessionId,
      turnId: options.turnId,
    })) as BrowserRunResult;
    return {
      success: true,
      data: renderRunResult(result),
      structured: result,
      redactInPersistence: true,
    };
  };

  return { executors, preflight, dispose: () => client.dispose() };
}

async function executeCategory(
  client: BridgeClient,
  category: string,
  args: Record<string, unknown>,
) {
  const action = String(args.action ?? "");
  const params = { ...args };
  delete params.action;
  delete params.__browser_approval;
  delete params.__browser_action_hash;
  const execution = (await client.send("agent_browser_bridge.command.execute", {
    category,
    action,
    params,
  })) as BrowserCommandExecutionResult;
  return { ...renderExecution(execution), redactInPersistence: true };
}

function renderExecution(execution: BrowserCommandExecutionResult) {
  const result = execution.result;
  if (isImageResult(result)) {
    return {
      success: true,
      data: `[截图完成] ${result.mimeType}`,
      content: [{ type: "image" as const, data: result.data, mimeType: result.mimeType }],
      structured: execution,
    };
  }
  const tabs = extractTabs(result);
  if (tabs) {
    return { success: true, data: renderTabs(tabs), structured: execution };
  }
  if (isRecord(result) && typeof result.dom_snapshot === "string") {
    return { success: true, data: truncate(result.dom_snapshot, 12_000), structured: execution };
  }
  return {
    success: true,
    data: truncate(JSON.stringify(result ?? {}, null, 2), 12_000),
    structured: execution,
  };
}

function renderRunResult(result: BrowserRunResult): string {
  const lines = result.results.map((execution, index) => (
    `${index + 1}. ${execution.category}.${execution.action} (${execution.commandId})`
  ));
  return [`Browser run completed: ${result.results.length} actions`, ...lines].join("\n");
}

function renderTabs(tabs: TabInfo[]): string {
  const lines = tabs.map((tab) => `[${tab.id}] ${tab.active ? "* " : "  "}${tab.title} — ${tab.url}`);
  return lines.join("\n") || "无打开的标签页";
}

function isImageResult(value: unknown): value is { mimeType: string; data: string } {
  return isRecord(value) && typeof value.mimeType === "string" && typeof value.data === "string";
}

function isTabArray(value: unknown): value is TabInfo[] {
  return Array.isArray(value) && value.every((entry) => isRecord(entry) && typeof entry.id === "number");
}

function extractTabs(value: unknown): TabInfo[] | null {
  if (isTabArray(value)) return value;
  if (isRecord(value) && isTabArray(value.tabs)) return value.tabs;
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit)}\n...[truncated]` : value;
}

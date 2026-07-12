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

const DOM_SNAPSHOT_MAX_CHARS = 50_000;
const BROWSER_HELP_MAX_CHARS = 20_000;
const LOCATOR_PAGE_MAX_CHARS = 20_000;
const BROWSER_RUN_MAX_CHARS = 100_000;

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
      return {
        success: true,
        data: truncateWithNotice(JSON.stringify(result, null, 2), BROWSER_HELP_MAX_CHARS, "BROWSER_HELP_TRUNCATED"),
        structured: result,
        preserveModelOutput: true,
      };
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
      preserveModelOutput: true,
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
  if (execution.status === "failed" || execution.error) {
    const code = execution.error?.code ? ` (${execution.error.code})` : "";
    return {
      success: false,
      data: `Browser action failed${code}: ${execution.error?.message ?? "unknown error"}`,
      structured: execution,
    };
  }
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
  if (execution.category === "dom" && execution.action === "snapshot" && isDomSnapshotResult(result)) {
    return {
      success: true,
      data: renderDomSnapshot(result),
      structured: execution,
      preserveModelOutput: true,
    };
  }
  if (
    execution.category === "locator"
    && (execution.action === "all_text_contents" || execution.action === "read_all")
    && isPaginatedValuesResult(result)
  ) {
    return {
      success: true,
      data: renderPaginatedValues(execution.action, result),
      structured: execution,
      preserveModelOutput: true,
    };
  }
  return {
    success: true,
    data: truncate(JSON.stringify(result ?? {}, null, 2), 12_000),
    structured: execution,
  };
}

function renderRunResult(result: BrowserRunResult): string {
  const sections = [`Browser run completed: ${result.results.length} actions`];
  let usedChars = sections[0].length;
  for (const [index, execution] of result.results.entries()) {
    const rendered = renderExecution(execution);
    const body = typeof rendered.data === "string" ? rendered.data : JSON.stringify(rendered.data ?? {});
    const section = [
      "",
      `## ${index + 1}. ${execution.category}.${execution.action} (${execution.commandId})`,
      body || "{}",
    ].join("\n");
    if (usedChars + section.length > BROWSER_RUN_MAX_CHARS) {
      sections.push(
        "",
        `[BROWSER_RUN_TRUNCATED] renderedActions=${index} totalActions=${result.results.length}`,
      );
      break;
    }
    sections.push(section);
    usedChars += section.length;
  }
  return sections.join("\n");
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

interface DomSnapshotNode extends Record<string, unknown> {
  nodeId: string;
}

interface DomSnapshotOutput {
  generation?: number;
  total: number;
  returned: number;
  truncated: boolean;
  nodes: DomSnapshotNode[];
}

interface PaginatedValuesOutput {
  values: unknown[];
  total: number;
  offset: number;
  returned: number;
  has_more: boolean;
}

function isDomSnapshotResult(value: unknown): value is DomSnapshotOutput {
  return isRecord(value)
    && Array.isArray(value.nodes)
    && typeof value.total === "number"
    && typeof value.returned === "number"
    && typeof value.truncated === "boolean";
}

function isPaginatedValuesResult(value: unknown): value is PaginatedValuesOutput {
  return isRecord(value)
    && Array.isArray(value.values)
    && typeof value.total === "number"
    && typeof value.offset === "number"
    && typeof value.returned === "number"
    && typeof value.has_more === "boolean";
}

function renderDomSnapshot(result: DomSnapshotOutput): string {
  const nodeLines = result.nodes.map(renderDomNode);
  const reserveChars = 320;
  const renderedLines: string[] = [];
  let bodyChars = 0;
  for (const line of nodeLines) {
    if (bodyChars + line.length + 1 > DOM_SNAPSHOT_MAX_CHARS - reserveChars) break;
    renderedLines.push(line);
    bodyChars += line.length + 1;
  }
  const outputTruncated = result.truncated || renderedLines.length < result.nodes.length;
  const header = [
    `DOM snapshot generation=${result.generation ?? "unknown"}`,
    `total=${result.total}`,
    `returned=${result.returned}`,
    `rendered=${renderedLines.length}`,
    `truncated=${outputTruncated}`,
  ].join(" ");
  const footer = outputTruncated
    ? `[DOM_SNAPSHOT_TRUNCATED] total=${result.total} returned=${result.returned} rendered=${renderedLines.length} omitted=${Math.max(0, result.total - renderedLines.length)}`
    : "";
  return [header, ...renderedLines, footer].filter(Boolean).join("\n");
}

function renderDomNode(node: DomSnapshotNode): string {
  const fields: string[] = [`[${node.nodeId}]`];
  const tagName = stringValue(node.tagName);
  if (tagName) fields.push(`<${tagName}>`);
  appendQuoted(fields, "text", node.text);
  appendQuoted(fields, "aria", node.ariaName);
  appendQuoted(fields, "role", node.role);
  appendQuoted(fields, "href", node.href);
  appendQuoted(fields, "type", node.type);
  if (node.textTruncated === true) fields.push(`textTruncated=true originalTextChars=${numberValue(node.originalTextChars) ?? "unknown"}`);
  if (node.visible === true) fields.push("visible");
  if (node.enabled === true) fields.push("enabled");
  if (node.editable === true) fields.push("editable");
  if (typeof node.checked === "boolean") fields.push(`checked=${node.checked}`);
  if (isRecord(node.boundingBox)) {
    const box = node.boundingBox;
    fields.push(`box=(${formatNumber(box.x)},${formatNumber(box.y)},${formatNumber(box.width)},${formatNumber(box.height)})`);
  }
  return fields.join(" ");
}

function renderPaginatedValues(action: string, result: PaginatedValuesOutput): string {
  const header = `${action} total=${result.total} offset=${result.offset} returned=${result.returned} has_more=${result.has_more}`;
  const lines = [header];
  let usedChars = header.length;
  let rendered = 0;
  for (const [index, value] of result.values.entries()) {
    const line = `[${result.offset + index}] ${compactJson(value)}`;
    if (usedChars + line.length + 1 > LOCATOR_PAGE_MAX_CHARS - 220) break;
    lines.push(line);
    usedChars += line.length + 1;
    rendered += 1;
  }
  if (rendered < result.values.length) {
    lines.push(`[LOCATOR_PAGE_OUTPUT_TRUNCATED] pageReturned=${result.returned} rendered=${rendered} rerunOffset=${result.offset + rendered}`);
  }
  return lines.join("\n");
}

function appendQuoted(fields: string[], name: string, value: unknown): void {
  const text = stringValue(value);
  if (text) fields.push(`${name}=${JSON.stringify(text)}`);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatNumber(value: unknown): string {
  const number = numberValue(value);
  return number === undefined ? "?" : String(Math.round(number * 100) / 100);
}

function compactJson(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value.replace(/\s+/g, " ").trim()) : JSON.stringify(value);
}

function truncateWithNotice(value: string, limit: number, marker: string): string {
  if (value.length <= limit) return value;
  const notice = `\n[${marker}] originalChars=${value.length} limit=${limit}`;
  return `${value.slice(0, Math.max(0, limit - notice.length))}${notice}`;
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit)}\n...[truncated]` : value;
}

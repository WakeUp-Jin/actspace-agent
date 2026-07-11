export function summarizeBrowserToolCall(
  toolName: string,
  args: Record<string, unknown>,
): string {
  if (toolName === "browser_run") {
    const count = Array.isArray(args.actions) ? args.actions.length : 0;
    return `Browser run · ${count} action${count === 1 ? "" : "s"}`;
  }
  if (toolName === "browser_help") {
    const category = stringValue(args.category);
    const action = stringValue(args.action);
    const query = stringValue(args.query);
    return `Browser help${category ? ` · ${category}${action ? `.${action}` : ""}` : query ? ` · ${query}` : ""}`;
  }

  const action = stringValue(args.action) || "action";
  const target = summarizeTarget(args);
  const label = toolName.replace(/^browser_/, "Browser ").replaceAll("_", " ");
  return `${label} · ${action}${target ? ` · ${target}` : ""}`;
}

function summarizeTarget(args: Record<string, unknown>): string {
  const url = stringValue(args.url);
  if (url) return url;
  const selector = stringValue(args.selector);
  if (selector) return selector;
  if (typeof args.x === "number" && typeof args.y === "number") return `(${args.x}, ${args.y})`;
  const files = Array.isArray(args.files) ? args.files.filter((item): item is string => typeof item === "string") : [];
  if (files.length > 0) return `${files.length} file${files.length === 1 ? "" : "s"}: ${files.map(fileName).join(", ")}`;
  const keep = Array.isArray(args.keep) ? args.keep : [];
  if (keep.length > 0) return `${keep.length} tab${keep.length === 1 ? "" : "s"} kept`;
  const downloadId = stringValue(args.download_id);
  if (downloadId) return `download ${downloadId}`;
  const chooserId = stringValue(args.file_chooser_id);
  if (chooserId) return `file chooser ${chooserId}`;
  if (typeof args.tab_id === "number") return `tab ${args.tab_id}`;
  return "";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

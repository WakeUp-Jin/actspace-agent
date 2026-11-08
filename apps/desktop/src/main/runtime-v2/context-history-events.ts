import type { ContextPanelEventKind } from "@actspace/shared";

/**
 * 上下文事件的标题和说明（规范 `front-Context面板规范.md` §2 第 6 块）。
 * 补充上下文按各插件固定的英文格式解析；解析不出来时退回「上下文补充 · id」加 owner，不报错。
 */

/** 每个补充来源上一次的解析结果，存进投影的折叠状态，用来写「新增 / 移除」「旧 → 新」。 */
export type SupplementMemory = { paths?: string[]; mode?: string };

export type DescribedSupplement = {
  kind: ContextPanelEventKind;
  label: string;
  detail: string;
  /** 合并多次更新时，说明里接在「本轮连续 N 次，合并显示；」后面的最新状态。 */
  tail: string;
  memory: SupplementMemory;
};

const DETAIL_LIMIT = 160;
const NAME_LIMIT = 3;

export function describeSupplementEvent(owner: string, id: string, text: string, previous: SupplementMemory | undefined): DescribedSupplement {
  if (owner === "actspace.context-disclosure" && id === "navigation") return describeFiles(text, previous);
  if (owner === "actspace.context-runtime" && id === "runtime-state") {
    const runtime = describeRuntime(text, previous);
    if (runtime) return runtime;
  }
  if (owner === "actspace.context-subagents" && id === "subagents") {
    const items = listItems(text, "Running subagents");
    if (items) return described("subagents", "子 Agent 清单更新", running(items.map(item => field(item, 1))), `${items.length} 个运行中`, {});
  }
  if (owner === "actspace.context-background-tasks" && id === "background-tasks") {
    if (text.trim() === "No background tasks are running.") return described("background", "后台任务清单更新", "全部结束", "全部结束", {});
    const items = listItems(text, "Background tasks still running");
    if (items) return described("background", "后台任务清单更新", running(items.map(item => field(item, 2))), `${items.length} 个运行中`, {});
  }
  return described("inject", `上下文补充 · ${id.slice(0, 48)}`, owner, owner, {});
}

/** 工具清单前后两份名单的差异。 */
export function describeToolChange(before: readonly string[], after: readonly string[]): string {
  const old = new Set(before); const now = new Set(after);
  const added = after.filter(name => !old.has(name));
  const removed = before.filter(name => !now.has(name));
  const parts = [
    ...(added.length ? [`新增 ${added.length} 个：${names(added)}`] : []),
    ...(removed.length ? [`移除 ${removed.length} 个：${names(removed)}`] : []),
  ];
  return clip(parts.length ? parts.join("；") : "工具说明变化");
}

/** 合并后的说明：「本轮连续 N 次，合并显示；」加最新一次的状态。 */
export function mergedDetail(count: number, tail: string): string {
  return clip(`本轮连续 ${count} 次，合并显示；${tail}`);
}

export function switchDetail(before: string | undefined, after: string): string {
  return clip(before && before !== after ? `${before} → ${after}` : `切换到 ${after}`);
}

function describeFiles(text: string, previous: SupplementMemory | undefined): DescribedSupplement {
  const paths = text.split("\n").flatMap(line => {
    const match = /^- ("(?:[^"\\]|\\.)*")/.exec(line);
    if (!match) return [];
    try { const path = JSON.parse(match[1]!) as unknown; return typeof path === "string" ? [path] : []; } catch { return []; }
  });
  const old = new Set(previous?.paths ?? []); const now = new Set(paths);
  const added = paths.filter(path => !old.has(path));
  const removed = (previous?.paths ?? []).filter(path => !now.has(path));
  const total = `共 ${paths.length} 个`;
  const parts = [
    ...(added.length ? [changed("新增", added)] : []),
    ...(removed.length ? [changed("移除", removed)] : []),
    ...(added.length || removed.length ? [] : ["文件不变"]),
    total,
  ];
  return described("files", "活跃文件清单更新", parts.join("，"), total, { paths });
}

function describeRuntime(text: string, previous: SupplementMemory | undefined): DescribedSupplement | null {
  const mode = /\bmode=([^;.\s]+)/.exec(text)?.[1];
  if (!mode) return null;
  const date = /\bdate=([^;\s]+?)[;.]/.exec(text)?.[1];
  const detail = previous?.mode && previous.mode !== mode ? `模式 ${previous.mode} → ${mode}` : `模式 ${mode}${date ? ` · 日期 ${date}` : ""}`;
  return described("runtime", "运行状态更新", detail, `模式 ${mode}`, { mode });
}

/** 「标题行 + `- a · b · c` 列表」格式的条目；标题不符时返回 null。 */
function listItems(text: string, heading: string): string[] | null {
  const lines = text.split("\n");
  if (!lines[0]?.startsWith(heading)) return null;
  return lines.slice(1).filter(line => line.startsWith("- ")).map(line => line.slice(2));
}

function field(item: string, index: number): string {
  return (item.split(" · ")[index] ?? item).trim();
}

function running(descriptions: readonly string[]): string {
  return descriptions.length ? `${descriptions.length} 个运行中：${names(descriptions)}` : "没有运行中的";
}

function changed(verb: string, paths: readonly string[]): string {
  const first = basename(paths[0]!);
  return paths.length === 1 ? `${verb} ${first}` : `${verb} ${first} 等 ${paths.length} 个`;
}

function names(values: readonly string[]): string {
  const shown = values.slice(0, NAME_LIMIT).join("、");
  return values.length > NAME_LIMIT ? `${shown} 等` : shown;
}

function basename(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  return trimmed.slice(trimmed.search(/[^\\/]*$/)) || path;
}

function clip(value: string): string {
  return value.length > DETAIL_LIMIT ? `${value.slice(0, DETAIL_LIMIT - 1)}…` : value;
}

function described(kind: ContextPanelEventKind, label: string, detail: string, tail: string, memory: SupplementMemory): DescribedSupplement {
  return { kind, label, detail: clip(detail), tail: clip(tail), memory };
}

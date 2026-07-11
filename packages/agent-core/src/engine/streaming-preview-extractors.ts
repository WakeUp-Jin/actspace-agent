/**
 * Streaming preview extractors
 *
 * 把 LLM 流式 tool_call args 中累积的 partial JSON 字符串，按 previewKind
 * 解析出关键字段，组装成 typed ToolUiPreview 推给前端。
 *
 * 新工具接入：在 EXTRACTORS 表里注册一行即可，前端零改动。
 *
 * 设计权衡（详见 docs/learnings/2026-05/llm-tool-call-streaming.md）：
 * - write_file: 提取 path + content（content 作为 streamingContent，前端边写边看）
 * - edit_file: 只提取 path（diff 需要文件上下文+替换执行才能生成，强行展示 old/new 会误导用户）
 * - 其他工具: 提取常用字段（filePath/pattern/command 等），缺失时蜕化为空字符串
 */

import type { ToolPreviewKind, ToolUiPreview } from "@actspace/shared";
import { extractStringField } from "./partial-args";

type Extractor = (partialArgsText: string) => ToolUiPreview;

function getField(partialJson: string, name: string): string | undefined {
  const result = extractStringField(partialJson, name);
  return result?.value;
}

const EXTRACTORS: Record<ToolPreviewKind, Extractor> = {
  read: (s) => ({
    kind: "read",
    filePath: getField(s, "path") ?? "",
    displayText: "",
  }),

  search: (s) => ({
    kind: "search",
    query: getField(s, "query") ?? "",
    displayText: "",
  }),

  grep: (s) => ({
    kind: "grep",
    pattern: getField(s, "pattern") ?? "",
    scope: getField(s, "glob") ?? getField(s, "path"),
    displayText: "",
  }),

  glob: (s) => ({
    kind: "glob",
    pattern: getField(s, "pattern") ?? "",
    scope: getField(s, "path"),
    displayText: "",
  }),

  web_search: (s) => {
    const url = getField(s, "url");
    if (url) {
      return { kind: "web_search", mode: "url", url, displayText: "" };
    }
    return {
      kind: "web_search",
      mode: "query",
      query: getField(s, "query") ?? "",
      displayText: "",
    };
  },

  media_analysis: (s) => {
    const source = getField(s, "source") ?? "";
    const mimeType = getField(s, "mimeType");
    const mediaKind = mimeType?.startsWith("image/")
      ? "image"
      : mimeType?.startsWith("video/")
        ? "video"
        : "media";
    return {
      kind: "media_analysis",
      mediaName: source,
      mediaKind,
      displayText: "",
    };
  },

  directory_list: (s) => ({
    kind: "directory_list",
    path: getField(s, "path") ?? "",
    displayText: "",
  }),

  edit_diff: (s) => ({
    kind: "edit_diff",
    filePath: getField(s, "path") ?? "",
    additions: 0,
    deletions: 0,
    diff: "",
    collapsedLines: 0,
  }),

  write: (s) => ({
    kind: "write",
    filePath: getField(s, "path") ?? "",
    additions: 0,
    deletions: 0,
    diff: "",
    collapsedLines: 0,
    streamingContent: getField(s, "content"),
  }),

  delete: (s) => ({
    kind: "delete",
    filePath: getField(s, "path") ?? "",
    displayText: "",
    status: "running",
  }),

  bash: (s) => ({
    kind: "bash",
    status: "running",
    title: "Bash command",
    command: getField(s, "command") ?? "",
  }),

  agent: (s) => {
    const description = getField(s, "description") ?? "";
    return {
      kind: "agent",
      description,
      status: "running",
      subagentType: "explore",
      displayText: description,
    };
  },

  browser_cua: (s) => browserCategoryPreview("Browser CUA", s),
  browser_dom: (s) => browserCategoryPreview("Browser DOM", s),
  browser_locator: (s) => browserCategoryPreview("Browser Locator", s),
  browser_navigation: (s) => browserCategoryPreview("Browser Navigation", s),
  browser_tabs: (s) => browserCategoryPreview("Browser Tabs", s),
  browser_user: (s) => browserCategoryPreview("Browser User", s),
  browser_wait: (s) => browserCategoryPreview("Browser Wait", s),
  browser_io: (s) => browserCategoryPreview("Browser I/O", s),
  browser_debug: (s) => browserCategoryPreview("Browser Debug", s),
  browser_help: (s) => browserCategoryPreview("Browser Help", s),
  browser_run: () => ({ kind: "generic", title: "Browser Run", content: "batch" }),

  browser_screenshot: () => ({ kind: "generic", title: "Browser Screenshot", content: "" }),
  browser_dom_snapshot: () => ({ kind: "generic", title: "DOM Snapshot", content: "" }),
  browser_navigate: (s) => ({ kind: "generic", title: "Navigate", content: getField(s, "url") ?? "" }),
  browser_open_tab: (s) => ({ kind: "generic", title: "Open Tab", content: getField(s, "url") ?? "" }),
  browser_list_tabs: () => ({ kind: "generic", title: "List Tabs", content: "" }),
  browser_click: (s) => ({ kind: "generic", title: "Click", content: getField(s, "selector") ?? "" }),
  browser_fill: (s) => ({ kind: "generic", title: "Fill", content: getField(s, "selector") ?? "" }),
  browser_press_key: (s) => ({ kind: "generic", title: "Press Key", content: getField(s, "keys") ?? "" }),
  browser_select: (s) => ({ kind: "generic", title: "Select", content: getField(s, "selector") ?? "" }),
  browser_scroll: (s) => ({ kind: "generic", title: "Scroll", content: getField(s, "direction") ?? "" }),
  browser_back: () => ({ kind: "generic", title: "Back", content: "" }),
  browser_close_tab: () => ({ kind: "generic", title: "Close Tab", content: "" }),
  browser_user_tabs: () => ({ kind: "generic", title: "User Tabs", content: "" }),
  browser_claim_tab: () => ({ kind: "generic", title: "Claim Tab", content: "" }),
  browser_finalize: () => ({ kind: "generic", title: "Finalize", content: "" }),

  generic: () => ({
    kind: "generic",
    title: "",
    content: "",
  }),
};

function browserCategoryPreview(title: string, partialArgsText: string): ToolUiPreview {
  const action = getField(partialArgsText, "action") ?? "";
  const target = getField(partialArgsText, "url") ?? getField(partialArgsText, "selector") ?? "";
  return { kind: "generic", title, content: [action, target].filter(Boolean).join(" · ") };
}

export function extractStreamingPreview(
  previewKind: ToolPreviewKind,
  partialArgsText: string,
): ToolUiPreview {
  const extractor = EXTRACTORS[previewKind] ?? EXTRACTORS.generic;
  return extractor(partialArgsText);
}

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

  bash: (s) => ({
    kind: "bash",
    status: "running",
    title: "Bash command",
    command: getField(s, "command") ?? "",
  }),

  generic: () => ({
    kind: "generic",
    title: "",
    content: "",
  }),
};

export function extractStreamingPreview(
  previewKind: ToolPreviewKind,
  partialArgsText: string,
): ToolUiPreview {
  const extractor = EXTRACTORS[previewKind] ?? EXTRACTORS.generic;
  return extractor(partialArgsText);
}

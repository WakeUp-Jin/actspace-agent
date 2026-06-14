/**
 * 按工具类型的 flash 摘要 system prompt + 压缩标记 helper
 *
 * 仅服务「重跑/翻页才能恢复、且适合摘要」的非 bash 工具
 * （read / grep / glob / directory_list / web_search / generic）。
 * bash 不在此注册表——其全量已落盘、走逐字头部 + 文件指针，不调 flash。
 *
 * 设计事实来源：docs/design-docs/agent-context-compression.md
 * 「按工具类型的摘要 prompt」「压缩标记」。
 */

import type { ToolPreviewKind } from "@actspace/shared";

const SHARED_RULE =
  "你是工具输出压缩器。把下面的工具输出压缩成更短的摘要，" +
  "只为节省上下文 token，不要回答问题、不要新增解释、不要编造原文没有的信息。" +
  "输出语言与原文保持一致。严格控制在 1500 字符以内。";

const READ_PROMPT =
  `${SHARED_RULE}\n` +
  "这是读取文件类工具的输出。必须逐字保留：每个被保留代码片段的行号前缀、" +
  "文件路径、关键符号/函数/类签名、导入与导出。可以折叠连续注释块、空行、" +
  "重复样板。对被省略的区间用 `[... 省略 N 行 ...]` 明确标注，不要悄悄丢弃。";

const GREP_PROMPT =
  `${SHARED_RULE}\n` +
  "这是内容检索类工具（grep）的输出。必须逐字保留：每条命中的 `文件路径:行号:命中行原文`，" +
  "以及命中总数。可以压缩纯上下文行（非命中行）。不要改写命中行内容。";

const GLOB_PROMPT =
  `${SHARED_RULE}\n` +
  "这是文件名检索类工具（glob）的输出。必须逐字保留文件路径、文件大小、修改时间与文件总数，" +
  "可以折叠同目录下的大量同类文件为 `<dir>/ 下 N 个文件`，但保留有代表性的具体路径。";

const DIRECTORY_PROMPT =
  `${SHARED_RULE}\n` +
  "这是目录列举类工具的输出。保留目录结构骨架与条目总数，" +
  "可以折叠大量同类条目，但保留关键子目录与有代表性的文件名。";

const WEB_PROMPT =
  `${SHARED_RULE}\n` +
  "这是网页搜索/抓取类工具的输出。保留结论性信息、关键事实、数字与所有链接 URL，" +
  "去掉导航、广告、重复段落与样板文字。";

const GENERIC_PROMPT =
  `${SHARED_RULE}\n` +
  "保留结论性信息、关键标识符（路径、ID、错误码、数字）与结构骨架，" +
  "去掉冗余与重复内容。";

/** 按 previewKind 返回 flash 摘要 system prompt。bash 不应进入此函数。 */
export function toolSummarySystemPrompt(kind: ToolPreviewKind): string {
  switch (kind) {
    case "read":
      return READ_PROMPT;
    case "grep":
    case "search":
      return GREP_PROMPT;
    case "glob":
      return GLOB_PROMPT;
    case "directory_list":
      return DIRECTORY_PROMPT;
    case "web_search":
      return WEB_PROMPT;
    default:
      return GENERIC_PROMPT;
  }
}

/** 按工具类型给出「如何取回完整原文」的提示语，拼进压缩标记。 */
export function recoveryHintFor(kind: ToolPreviewKind, overflowPath?: string): string {
  if (overflowPath) {
    return `完整原文见 ${overflowPath}，可用 read_file 读取`;
  }
  switch (kind) {
    case "read":
      return "可用 offset/limit 翻页或重读原文件获取完整内容";
    case "grep":
    case "search":
    case "glob":
      return "可重跑搜索获取完整结果";
    case "directory_list":
      return "可重跑 list_directory 获取完整列表";
    case "web_search":
      return "可重新搜索/抓取获取完整内容";
    default:
      return "可重新执行该工具获取完整结果";
  }
}

/** 压缩标记前缀，明确告知模型「内容不完整、原文如何取」。 */
export function compressedNotice(originalChars: number, recoveryHint: string): string {
  return `[已压缩摘要 ⚠️ 原始 ${originalChars} 字符 → 以下包含原始输出前缀与 flash 摘要，非完整原文。${recoveryHint}]`;
}

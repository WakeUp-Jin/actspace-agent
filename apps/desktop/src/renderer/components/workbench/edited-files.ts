import type { MessageBlock } from "@actspace/shared";

/**
 * 从消息流里收集 Agent 改过的文件路径。
 *
 * 只看已完成的编辑/写入块：`pending`（等审批）和 `running`（还在写）时磁盘内容尚未定型，
 * 这时就打过期标记会让提示条来回闪。优先用工作区相对路径，缺失时退回 `filePath`。
 */
export function collectEditedFilePaths(messages: MessageBlock[]): string[] {
  const paths = new Set<string>();
  for (const message of messages) {
    if (message.kind !== "edit_diff" && message.kind !== "write_diff") continue;
    if (message.status !== "completed") continue;
    const path = message.outputRelativePath || message.filePath;
    if (path) paths.add(path);
  }
  return [...paths];
}

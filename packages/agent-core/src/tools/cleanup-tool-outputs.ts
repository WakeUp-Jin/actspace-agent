/**
 * 工具落盘文件定时清理
 *
 * bash 大输出流式落盘到 `<tmpRoot>/tool-output/<sessionId>/*.txt`，长期累积会撑大磁盘。
 * 仿 observability/agent-run-log.ts#cleanupOldAgentRunLogs，按文件 mtime 删除超期文件，
 * 并回收空的会话子目录。在 turn 开始时调用（best-effort，失败不影响主流程）。
 *
 * 设计事实来源：docs/design-docs/model-context/agent-context-compression.md「M5 清理」。
 */

import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { TOOL_OUTPUT_DIRNAME } from "./tool-output-paths";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 清理 `<tmpRoot>/tool-output/` 下 mtime 超过 `maxAgeMs`（默认 7 天）的落盘文件，
 * 并删除随之变空的会话子目录。根目录不存在时静默返回。
 */
export async function cleanupOldToolOutputs(
  tmpRoot: string,
  maxAgeMs = SEVEN_DAYS_MS,
  now = Date.now(),
): Promise<void> {
  const root = join(tmpRoot, TOOL_OUTPUT_DIRNAME);

  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    // ENOENT 等：没有落盘目录，无需清理
    return;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(root, entry.name);
      if (entry.isDirectory()) {
        await cleanupSessionDir(entryPath, maxAgeMs, now);
      } else if (entry.isFile()) {
        await removeIfOld(entryPath, maxAgeMs, now);
      }
    }),
  );
}

async function cleanupSessionDir(dirPath: string, maxAgeMs: number, now: number): Promise<void> {
  let files: import("node:fs").Dirent[];
  try {
    files = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    files.map((file) =>
      file.isFile() ? removeIfOld(join(dirPath, file.name), maxAgeMs, now) : Promise.resolve(),
    ),
  );

  // 若子目录已空则回收
  try {
    const remaining = await readdir(dirPath);
    if (remaining.length === 0) {
      await rm(dirPath, { recursive: true, force: true });
    }
  } catch {
    // 忽略并发删除等竞态
  }
}

async function removeIfOld(filePath: string, maxAgeMs: number, now: number): Promise<void> {
  try {
    const info = await stat(filePath);
    if (now - info.mtimeMs > maxAgeMs) {
      await rm(filePath, { force: true });
    }
  } catch {
    // 文件已被删除或无法访问，忽略
  }
}

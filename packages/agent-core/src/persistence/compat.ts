/**
 * 旧版兼容函数
 *
 * readSessionJsonl：返回原始 JSON 字符串数组（旧行为）
 * appendSessionEvent：接受 unknown 类型事件（旧签名）
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/** @deprecated 使用 parseJsonl 替代 */
export async function readSessionJsonl(sessionPath: string): Promise<string[]> {
  try {
    const content = await readFile(sessionPath, "utf8");
    return content
      .split("\n")
      .map((line: string) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** @deprecated 使用 appendEvent 替代 */
export async function appendSessionEvent(sessionPath: string, event: unknown): Promise<void> {
  await mkdir(dirname(sessionPath), { recursive: true });
  await writeFile(sessionPath, `${JSON.stringify(event)}\n`, { flag: "a" });
}

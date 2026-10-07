/** 主 Agent 的 system prompt 文件：不存在时创建，读取和写入。 */
import { readFile } from "node:fs/promises";
import type { AgentSystemPromptFile } from "@actspace/shared";
import { writeTextAtomic } from "./atomic-io";
import { AGENT_SYSTEM_PROMPT_MAX_CHARS, MAIN_AGENT_SYSTEM_PROMPT } from "./constants";
import { isNotFoundError } from "./utils";

export async function ensureSystemPromptFile(filePath: string, legacySystemPrompt?: string): Promise<void> {
  try {
    await readFile(filePath, "utf8");
    return;
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
  const initialContent = legacySystemPrompt && legacySystemPrompt.trim().length > 0
    ? legacySystemPrompt.slice(0, AGENT_SYSTEM_PROMPT_MAX_CHARS)
    : MAIN_AGENT_SYSTEM_PROMPT;
  await writeTextAtomic(filePath, initialContent);
}

export async function readSystemPromptFile(filePath: string): Promise<AgentSystemPromptFile> {
  return { path: filePath, content: await readFile(filePath, "utf8") };
}

/** 写入截断后的内容，返回实际写入的内容。 */
export async function writeSystemPromptFile(filePath: string, content: string): Promise<string> {
  const nextContent = content.slice(0, AGENT_SYSTEM_PROMPT_MAX_CHARS);
  await writeTextAtomic(filePath, nextContent);
  return nextContent;
}

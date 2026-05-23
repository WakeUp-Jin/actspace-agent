/**
 * JSONL 读写 — 健壮版
 *
 * 写入：追加模式，结构化错误传播（不静默吞掉）
 * 读取：逐行解析，坏行跳过不中断，返回 { events, errors, totalLines }
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { normalizeSessionEvents } from "@actspace/shared";
import type { SessionEvent } from "@actspace/shared";
import type { JsonlParseResult, WriteResult } from "./types";

/**
 * 追加一个事件到 session.jsonl
 * 写入失败返回结构化错误，不抛出异常
 */
export async function appendEvent(
  sessionPath: string,
  event: SessionEvent,
): Promise<WriteResult> {
  try {
    await mkdir(dirname(sessionPath), { recursive: true });
    const line = JSON.stringify(event) + "\n";
    await writeFile(sessionPath, line, { flag: "a" });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to append event to ${sessionPath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * 批量追加事件
 * 返回每个事件的写入结果
 */
export async function appendEvents(
  sessionPath: string,
  events: SessionEvent[],
): Promise<WriteResult> {
  try {
    await mkdir(dirname(sessionPath), { recursive: true });
    const content = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await writeFile(sessionPath, content, { flag: "a" });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to append ${events.length} events to ${sessionPath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * 解析 session.jsonl，坏行容错
 *
 * 无法解析的行跳过，不中断整个恢复
 * 返回 { events, errors, totalLines }
 */
export async function parseJsonl(sessionPath: string): Promise<JsonlParseResult> {
  const errors: JsonlParseResult["errors"] = [];

  let content: string;
  try {
    content = await readFile(sessionPath, "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT")) {
      return { events: [], errors: [], totalLines: 0 };
    }
    return {
      events: [],
      errors: [{ line: 0, raw: "", error: `Failed to read file: ${msg}` }],
      totalLines: 0,
    };
  }

  const lines = content.split("\n").filter((l) => l.trim() !== "");
  const rawRecords: unknown[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    try {
      rawRecords.push(JSON.parse(line));
    } catch (err) {
      errors.push({
        line: i + 1,
        raw: line.length > 200 ? line.slice(0, 200) + "..." : line,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const events = normalizeSessionEvents(rawRecords);

  return {
    events,
    errors,
    totalLines: lines.length,
  };
}

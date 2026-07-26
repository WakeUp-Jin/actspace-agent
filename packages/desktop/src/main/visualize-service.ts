/**
 * 消息可视化转换的 main 侧服务。
 *
 * 职责（见 `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`）：
 * - 缓存「生成一次、持久化、后续读缓存」：键 = `messageId:sourceHash`，落在 session 目录的
 *   `visualizations.json` sidecar；命中即返回、**不触发模型调用**。
 * - 未命中（或 regenerate）才调用 agent-core `convertReplyToHtml`（一次主模型调用）。
 *
 * 成本敏感：每次真实生成都是一次模型调用，所以默认走缓存。
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  convertReplyToHtml,
  isCompleteHtmlDocument,
  type ConvertReplyToHtmlResult,
  type LLMConfig,
} from "@actspace/agent-core";
import type {
  ListVisualizationsInput,
  ListVisualizationsResult,
  VisualizeReplyInput,
  VisualizeReplyResult,
} from "@actspace/shared";
import type { AppDataRoots } from "./agent-turn";

type StoredVisualization = {
  messageId: string;
  sourceHash: string;
  /** 文件列表展示名（旧缓存可能缺省，读取时兜底）。 */
  title?: string;
  html: string;
  model: string;
  provider: string;
  usage: { input: number; output: number; totalTokens: number };
  createdAt: string;
};

type VisualizationStore = Record<string, StoredVisualization>;

export type VisualizeReplyDependencies = {
  resolveMainModel: (
    requestedModel?: string | null,
  ) => { ok: true; llmConfig: LLMConfig } | { ok: false; message: string };
  convertReply?: (input: { content: string; llmConfig: LLMConfig }) => Promise<ConvertReplyToHtmlResult>;
};

function sourceHashOf(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex").slice(0, 16);
}

/** 从回复 Markdown 派生一个简短文件名：取首个非空行、剥常见 Markdown 记号、截断。 */
function deriveTitle(content: string): string {
  const firstLine =
    content
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "回复";
  const stripped = firstLine.replace(/^#+\s*/, "").replace(/[*_`>#~]/g, "").trim() || "回复";
  return stripped.length > 24 ? `${stripped.slice(0, 24)}…` : stripped;
}

function cacheKeyOf(messageId: string, sourceHash: string): string {
  return `${messageId}:${sourceHash}`;
}

function storePath(sessionRoot: string, sessionId: string): string {
  return join(sessionRoot, sessionId, "visualizations.json");
}

async function readStore(path: string): Promise<VisualizationStore> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as VisualizationStore;
  } catch {
    return {};
  }
}

async function writeStore(path: string, store: VisualizationStore): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(store, null, 2), "utf8");
}

export async function visualizeReply(
  input: VisualizeReplyInput,
  roots: AppDataRoots,
  dependencies: VisualizeReplyDependencies,
): Promise<VisualizeReplyResult> {
  const sourceHash = sourceHashOf(input.content);
  const cacheKey = cacheKeyOf(input.messageId, sourceHash);
  const path = storePath(roots.sessionRoot, input.sessionId);
  const store = await readStore(path);

  const hit = store[cacheKey];
  if (!input.regenerate && hit && isCompleteHtmlDocument(hit.html)) {
    return {
      html: hit.html,
      sourceHash,
      cached: true,
      model: hit.model,
      provider: hit.provider,
      usage: hit.usage,
    };
  }

  const resolution = dependencies.resolveMainModel(input.modelKey ?? input.model ?? null);
  if (resolution.ok === false) {
    throw new Error(resolution.message);
  }

  const result = await (dependencies.convertReply ?? convertReplyToHtml)({
    content: input.content,
    llmConfig: resolution.llmConfig,
  });

  store[cacheKey] = {
    messageId: input.messageId,
    sourceHash,
    title: deriveTitle(input.content),
    html: result.html,
    model: result.model,
    provider: result.provider,
    usage: result.usage,
    createdAt: new Date().toISOString(),
  };
  await writeStore(path, store);

  return {
    html: result.html,
    sourceHash,
    cached: false,
    model: result.model,
    provider: result.provider,
    usage: result.usage,
  };
}

/** 列出某会话已生成的全部可视化 HTML，按 createdAt 倒序（最新在前）。 */
export async function listVisualizations(
  input: ListVisualizationsInput,
  roots: AppDataRoots,
): Promise<ListVisualizationsResult> {
  const path = storePath(roots.sessionRoot, input.sessionId);
  const store = await readStore(path);
  const items = Object.values(store)
    .filter((entry) => isCompleteHtmlDocument(entry.html))
    .map((entry) => ({
      messageId: entry.messageId,
      sourceHash: entry.sourceHash,
      title: entry.title ?? `可视化 ${entry.messageId.slice(0, 8)}`,
      html: entry.html,
      model: entry.model,
      createdAt: entry.createdAt,
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return { items };
}

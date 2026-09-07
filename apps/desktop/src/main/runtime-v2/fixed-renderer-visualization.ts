import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ListVisualizationsResult, VisualizeReplyInput, VisualizeReplyResult } from "@actspace/shared";
import type { AppDataRoots } from "../app-paths";
import type { DesktopRuntimeV2Registry } from "./runtime-registry";

type StoredVisualization = {
  readonly messageId: string;
  readonly sourceHash: string;
  readonly title: string;
  readonly html: string;
  readonly model: string;
  readonly provider: string;
  readonly usage: { readonly input: number; readonly output: number; readonly totalTokens: number };
  readonly createdAt: string;
};

const SYSTEM_PROMPT = [
  "Turn the supplied Markdown reply into one complete, self-contained HTML document.",
  "Return only HTML beginning with <!doctype html>.",
  "Use one inline <style> block and no external scripts, styles, fonts, images, fetch, XHR, WebSocket, or network resources.",
  "Preserve the source meaning and structure. Use accessible semantic HTML and support light and dark color schemes.",
].join("\n");

export async function visualizeReplyV2(input: VisualizeReplyInput, roots: AppDataRoots, registry: DesktopRuntimeV2Registry): Promise<VisualizeReplyResult> {
  await registry.inspectSession(input.sessionId);
  const sourceHash = createHash("sha256").update(input.content, "utf8").digest("hex").slice(0, 16);
  const key = `${input.messageId}:${sourceHash}`;
  const path = storePath(roots, input.sessionId);
  const store = await readStore(path);
  const hit = store[key];
  if (!input.regenerate && hit && isCompleteHtml(hit.html)) return { html: hit.html, sourceHash, cached: true, model: hit.model, provider: hit.provider, usage: hit.usage };
  const result = await registry.completeText({
    sessionId: input.sessionId,
    model: input.modelKey ?? input.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `----- BEGIN MARKDOWN -----\n${input.content}\n----- END MARKDOWN -----` },
    ],
  });
  const html = extractHtml(result.text);
  if (!isCompleteHtml(html)) throw new Error("The model did not return a complete self-contained HTML document.");
  const item: StoredVisualization = {
    messageId: input.messageId,
    sourceHash,
    title: deriveTitle(input.content),
    html,
    model: result.model,
    provider: result.provider,
    usage: { input: result.usage.inputTokens ?? 0, output: result.usage.outputTokens ?? 0, totalTokens: (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0) },
    createdAt: new Date().toISOString(),
  };
  store[key] = item;
  await writeStore(path, store);
  return { html, sourceHash, cached: false, model: item.model, provider: item.provider, usage: item.usage };
}

export async function listVisualizationsV2(sessionId: string, roots: AppDataRoots, registry: DesktopRuntimeV2Registry): Promise<ListVisualizationsResult> {
  await registry.inspectSession(sessionId);
  const store = await readStore(storePath(roots, sessionId));
  return { items: Object.values(store).filter((item) => isCompleteHtml(item.html)).map((item) => ({ messageId: item.messageId, sourceHash: item.sourceHash, title: item.title, html: item.html, model: item.model, createdAt: item.createdAt })).sort((left, right) => right.createdAt.localeCompare(left.createdAt)) };
}

function storePath(roots: AppDataRoots, sessionId: string): string { return join(roots.dataRoot, "sessions-v2", sessionId, "visualizations.json"); }
async function readStore(path: string): Promise<Record<string, StoredVisualization>> { try { const value = JSON.parse(await readFile(path, "utf8")); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch { return {}; } }
async function writeStore(path: string, store: Record<string, StoredVisualization>): Promise<void> { await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 }); await rename(temporary, path); }
function extractHtml(value: string): string { const text = value.trim(); const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i); if (fenced?.[1]?.trim()) return fenced[1].trim(); const start = text.search(/<!doctype html|<html[\s>]/i); return start >= 0 ? text.slice(start).trim() : text; }
function isCompleteHtml(value: string): boolean { const text = value.trim(); return /^<!doctype html>/i.test(text) && /<html[\s>]/i.test(text) && /<\/html>\s*$/i.test(text) && !/<script\b|\b(?:src|href)\s*=\s*["']https?:|\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b/i.test(text); }
function deriveTitle(content: string): string { const line = content.split("\n").map((item) => item.trim()).find(Boolean) ?? "Reply"; const title = line.replace(/^#+\s*/, "").replace(/[*_`>#~]/g, "").trim() || "Reply"; return title.length > 24 ? `${title.slice(0, 24)}...` : title; }

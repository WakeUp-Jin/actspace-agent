import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { SessionSurfaceEntry } from "@actspace/session-journal";
import type { LlmService } from "@actspace/llm-service";

export type CompactionSummary = { readonly content: string; readonly metadata?: RuntimeV2JsonValue };

export interface CompactionSummarizer {
  summarize(entries: readonly SessionSurfaceEntry[], context: { readonly sessionId: string; readonly turnId?: string }): Promise<CompactionSummary>;
}

export class DeterministicCompactionSummarizer implements CompactionSummarizer {
  async summarize(entries: readonly SessionSurfaceEntry[]): Promise<CompactionSummary> {
    const lines = entries.map((entry) => `${entry.node.kind}: ${summaryText(entry.node.content)}`);
    return { content: `Compacted history:\n${lines.join("\n")}` };
  }
}

export class LlmCompactionSummarizer implements CompactionSummarizer {
  constructor(private readonly options: { readonly llm: LlmService; readonly routeId: string; readonly model: string }) {}

  async summarize(entries: readonly SessionSurfaceEntry[], context: { readonly sessionId: string; readonly turnId?: string }): Promise<CompactionSummary> {
    const requestId = `compaction:${context.sessionId}:${context.turnId ?? "between-turns"}`;
    const prepared = this.options.llm.prepare({
      requestId,
      routeId: this.options.routeId,
      model: this.options.model,
      messages: [
        { role: "system", content: "Summarize the supplied Agent history faithfully. Preserve user requirements, decisions, file paths, errors, unfinished work, and tool outcomes. Do not invent facts." },
        { role: "user", content: entries.map((entry) => `${entry.node.kind}: ${summaryText(entry.node.content)}`).join("\n") },
      ],
      tools: [],
      signal: new AbortController().signal,
    });
    try {
      const stream = await prepared.dispatch(); let text = ""; let terminal = false;
      for await (const event of stream) {
        if (event.type === "text-delta") text += event.text;
        if (event.type === "done") { terminal = true; if (text.length === 0) text = event.content.filter((block) => block.type === "text").map((block) => block.text).join(""); }
        if (event.type === "error") throw new Error(`Compaction LLM failed: ${event.failure.message}`);
        if (event.type === "aborted") throw new Error(`Compaction LLM aborted: ${event.reason}`);
      }
      if (!terminal || text.trim().length === 0) throw new Error("Compaction LLM returned no terminal summary.");
      return { content: text.trim(), metadata: { routeId: prepared.request.routeId, model: prepared.request.model, registrationId: prepared.registration.registrationId, adapterVersion: prepared.registration.adapter.adapterVersion } };
    } finally {
      prepared.release();
    }
  }
}

function summaryText(value: RuntimeV2JsonValue): string {
  const sanitized = stripRuntimeContext(value);
  return typeof sanitized === "string" ? sanitized : JSON.stringify(sanitized) ?? "";
}

function stripRuntimeContext(value: RuntimeV2JsonValue): RuntimeV2JsonValue {
  if (typeof value === "string") return value.startsWith("<runtime_context>") ? "" : value;
  if (Array.isArray(value)) return value.flatMap((item) => isRuntimeContext(item) ? [] : [stripRuntimeContext(item)]);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, stripRuntimeContext(child)]));
}

function isRuntimeContext(value: RuntimeV2JsonValue): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Readonly<Record<string, RuntimeV2JsonValue>>;
  if (record.type === "runtime-context") return true;
  return record.type === "text" && typeof record.text === "string" && record.text.startsWith("<runtime_context>");
}

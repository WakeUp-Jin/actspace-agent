import { expect, it, vi } from "vitest";
import type { LlmService } from "@actspace/llm-service";
import { LlmCompactionSummarizer } from "../summarizer.js";
import { chooseCompactionRegion } from "../region.js";
import { DEFAULT_COMPACTION_POLICY } from "../policy.js";

it("passes the full Relevant Files instruction, prior summary once, no tools, and cancellation", async () => {
  const release = vi.fn(); const signal = new AbortController().signal;
  const prepareAsync = vi.fn(async request => ({ request, registration: { registrationId: "test", adapter: { adapterVersion: "test" } }, release,
    dispatch: async () => (async function* () { yield { type: "done", content: [{ type: "text", text: "summary\n## Relevant files / directories\nAGENTS.md" }] }; })() }));
  const summarizer = new LlmCompactionSummarizer({ llm: { prepareAsync } as unknown as LlmService, routeId: "utility", model: "default" });
  const summary = await summarizer.summarize([
    { node: { kind: "user", messageId: "prior", content: "PRIOR-FACT" }, sourceEventSeqs: [1] },
    { node: { kind: "user", messageId: "new", content: "NEW-FACT" }, sourceEventSeqs: [2] },
  ], { sessionId: "s", summaryIds: ["prior"], signal });
  const request = prepareAsync.mock.calls[0]![0];
  expect(request.tools).toEqual([]); expect(request.signal).toBe(signal);
  const text = JSON.stringify(request.messages);
  expect(text.match(/PRIOR-FACT/g)).toHaveLength(1); expect(text.match(/NEW-FACT/g)).toHaveLength(1);
  expect(text).toContain("## Relevant Files"); expect(text).toContain("<prior-summary>");
  expect(summary.content).toContain("AGENTS.md"); expect(release).toHaveBeenCalledOnce();
});

it("does not split an assistant call and its trailing tool results", () => {
  const entries = ["user", "user", "assistant", "tool-result", "tool-result"].map((kind, i) => ({ node: { kind, messageId: `m${i}`, content: "x" }, sourceEventSeqs: [i] }));
  expect(chooseCompactionRegion({ entries, replaceGeneration: 0 } as never, { ...DEFAULT_COMPACTION_POLICY, minimumRegionEntries: 2 })).toEqual({ start: 0, end: 2 });
});

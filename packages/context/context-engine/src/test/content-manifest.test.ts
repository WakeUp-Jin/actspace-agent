import { describe, it, expect } from "vitest";
import { BLOCK_OVERHEAD, MESSAGE_OVERHEAD } from "@actspace/shared";
import { ContextEngine } from "../engine.js";
import { describeContextContent } from "../content-manifest.js";
import { requestRecords } from "../request-snapshot.js";
import type { Context } from "../types.js";
const context: Context = { request: { sessionId: "s", requestId: "r", routeId: "p", model: "m", options: {} }, content: { system: { sections: [{ id: "rules", owner: "rules", order: 1, content: "x".repeat(4000) }], modelFacts: [] }, tools: [], supplements: [], conversation: { replaceGeneration: 0, entries: [{ node: { kind: "user", messageId: "u", content: "hello" }, sourceEventSeqs: [1] }, { node: { kind: "assistant", messageId: "a", content: [{ type: "reasoning", text: "thought" }, { type: "tool-call", callId: "c", name: "read", arguments: {} }] }, sourceEventSeqs: [2] }] } }, status: { throughJournalSeq: 2, cycle: 0, paths: [], facts: [], plugins: {} } };
describe("Context content manifest", () => {
  it("keeps source keys across revisions and estimates before preview clipping", () => {
    const first = describeContextContent(context).manifest;
    const next = describeContextContent({ ...context, status: { ...context.status, contextRevision: 20 } }).manifest;
    expect(first.entries.map(row => row.key)).toEqual(next.entries.map(row => row.key));
    // 一项非对话内容：4000 字 / 4 + 每块 4。
    expect(first.entries[0]).toMatchObject({ estimatedTokens: 1000 + BLOCK_OVERHEAD });
    // 助手消息只有思考和工具调用：消息开销记一次，落在思考项上。
    expect(first.entries.find(row => row.kind === "thinking")?.estimatedTokens).toBe(Math.ceil("thought".length / 4) + BLOCK_OVERHEAD + MESSAGE_OVERHEAD);
    expect(first.entries.find(row => row.kind === "tool-call")?.estimatedTokens).toBe(Math.ceil("read".length / 4) + Math.ceil("{}".length / 4) + BLOCK_OVERHEAD);
    expect(first.entries[0]!.preview).toHaveLength(600);
    expect(first.entries.filter(row => row.bucket === "conversation").every(row => !row.preview)).toBe(true);
    expect(first.entries.find(row => row.kind === "thinking")?.trajectoryRef).toEqual({ messageId: "a" });
  });
  it.each([
    { name: "compaction identity", state: { summaries: [{ messageId: "summary-message", compactionId: "compact-1" }] }, key: '["summary","compact-1"]' },
    { name: "legacy summary identities", state: { summaryIds: ["summary-message"] }, key: '["summary","summary-message"]' },
  ])("previews summaries without exposing full text or persisting previews: $name", async ({ state, key }) => {
    const summaryText = "Summary preview boundary. ".repeat(40);
    const withSummary: Context = {
      ...context,
      content: { ...context.content, conversation: {
        ...context.content.conversation,
        entries: [...context.content.conversation.entries, {
          node: { kind: "user", messageId: "summary-message", content: summaryText }, sourceEventSeqs: [3],
        }],
      } },
      status: { ...context.status, plugins: { "actspace.context.compaction": state } },
    };
    const described = describeContextContent(withSummary);
    const summary = described.manifest.entries.find(entry => entry.key === key)!;
    expect(summary).toMatchObject({
      bucket: "summarizedConversation", title: "压缩摘要", preview: summaryText.slice(0, 600),
      estimatedTokens: Math.ceil(summaryText.length / 4) + BLOCK_OVERHEAD + MESSAGE_OVERHEAD, trajectoryRef: { messageId: "summary-message" },
    });
    expect(summary.fullTextAvailable).toBeUndefined();
    expect(described.text.has(key)).toBe(false);
    expect(described.manifest.entries.filter(entry => entry.bucket === "conversation")
      .every(entry => entry.preview === undefined && entry.fullTextAvailable === undefined && !described.text.has(entry.key))).toBe(true);

    const engine = new ContextEngine({ resolve: () => withSummary });
    const view = await engine.getContext(withSummary.request);
    expect(engine.getProjection(view.request)!.manifest.entries.find(entry => entry.key === key)?.preview).toBe(summaryText.slice(0, 600));
    const input = await engine.toLlmInput(view);
    // 请求记录不带估算明细，也不带对话。
    const records = requestRecords(view, input, {}, "composition", "host");
    expect(JSON.stringify(records)).not.toContain("Summary preview boundary.");
  });
  it("splits the request into a prompt record, a tools record and a small snapshot", async () => {
    const engine = new ContextEngine({ resolve: () => context });
    const input = await engine.toLlmInput(context);
    const records = requestRecords(context, input, {}, "composition", "host");
    expect(records.systemPrompt.sections).toEqual([{ owner: "rules", id: "rules", order: 1, content: "x".repeat(4000) }]);
    expect(records.tools.tools).toEqual([]);
    expect(records.snapshot).toMatchObject({ schemaVersion: 3, systemPromptDigest: records.systemPrompt.digest, toolsDigest: records.tools.digest });
    expect(JSON.stringify(records.snapshot)).not.toContain("thought");
    expect(Object.isFrozen(records.snapshot)).toBe(true);
    // 内容相同，digest 相同。
    expect(requestRecords(context, input, { other: true }, "c", "h").systemPrompt.digest).toBe(records.systemPrompt.digest);
  });
  it("keeps individual skill identities and excludes unrelated model facts from skills", () => {
    const withSkills: Context = { ...context, content: { ...context.content, system: { sections: [], modelFacts: [[{ id: "alpha", name: "Alpha" }, { id: "beta", name: "Beta" }], { model: "m" }], modelFactSources: [{ owner: "actspace.context-skills", id: "core/skills-catalog" }, { owner: "system", id: "model" }] } } };
    const first = describeContextContent(withSkills).manifest;
    const skills = first.entries.filter(entry => entry.bucket === "skills");
    expect(skills).toHaveLength(2);
    const reordered = structuredClone(withSkills);
    (reordered.content.system.modelFacts[0] as unknown[]).reverse();
    expect(describeContextContent(reordered).manifest.entries.filter(entry => entry.bucket === "skills").map(entry => entry.key).sort()).toEqual(skills.map(entry => entry.key).sort());
    expect(first.entries.find(entry => entry.bucket === "systemPrompt")?.preview).toContain('"model":"m"');
  });
  it("changes instance generation after eviction and exposes actual model facts", async () => {
    const engine = new ContextEngine({ resolve: () => context });
    let view = await engine.getContext(context.request);
    view = await engine.recordPrepared(view, { modelKey: "p/m", label: "m", contextWindow: 4096, autoCompactAtTokens: 2000 });
    const before = engine.getProjection(context.request)!;
    expect(before.model?.autoCompactAtTokens).toBe(2000);
    expect(engine.getProjection(context.request)).toBe(before);
    engine.evict(context.request); await engine.getContext(context.request);
    expect(engine.getProjection(context.request)!.instanceGeneration).not.toBe(before.instanceGeneration);
  });
});

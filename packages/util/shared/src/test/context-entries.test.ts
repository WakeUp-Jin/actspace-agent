import { describe, expect, it } from "vitest";
import { BLOCK_OVERHEAD, MESSAGE_OVERHEAD } from "../token-estimate";
import { contextEntryKey, contextSummaryKeys, describeConversationEntries, describeStaticContextEntries, estimateConversationNode, renderSystemPrompt, sumContextBuckets } from "../context-entries";

describe("context entries", () => {
  it("classifies system sections, skills, model facts, tools and supplements", () => {
    const items = describeStaticContextEntries({
      sections: [
        { id: "core", owner: "actspace.context-system", order: 0, content: "  base  " },
        { id: "workspace", owner: "actspace.context-rules", order: 1, content: "rule text" },
      ],
      modelFacts: [[{ id: "pdf", name: "PDF" }], { cwd: "/w" }],
      modelFactSources: [{ owner: "actspace.context-skills", id: "core/skills-catalog" }, { owner: "actspace.runtime", id: "cwd" }],
      tools: [{ name: "read_file", pluginId: "fs" }],
      supplements: [{ owner: "paths", id: "active", text: "a" }],
    });
    const byKey = new Map(items.map(item => [item.entry.key, item.entry]));
    expect(byKey.get(contextEntryKey("section", "actspace.context-system", "core"))).toMatchObject({ bucket: "systemPrompt", estimatedTokens: 1 + BLOCK_OVERHEAD });
    expect(byKey.get(contextEntryKey("section", "actspace.context-rules", "workspace"))?.bucket).toBe("rules");
    expect(byKey.get(contextEntryKey("skill", "actspace.context-skills", "core/skills-catalog", "pdf"))).toMatchObject({ bucket: "skills", title: "PDF" });
    expect(byKey.get(contextEntryKey("model-facts"))?.bucket).toBe("systemPrompt");
    expect(byKey.get(contextEntryKey("tool", "fs", "read_file"))?.bucket).toBe("tools");
    const supplement = byKey.get(contextEntryKey("supplement", "paths", "active"))!;
    expect(supplement.bucket).toBe("systemPrompt");
    expect(supplement.estimatedTokens).toBeGreaterThan(BLOCK_OVERHEAD + MESSAGE_OVERHEAD);
  });

  it("splits assistant messages and charges the message overhead once", () => {
    const node = { kind: "assistant", messageId: "a", content: [{ type: "text", text: "abcd" }, { type: "reasoning", text: "abcd" }, { type: "tool-call", callId: "c", name: "read", arguments: "{}" }] };
    const items = describeConversationEntries([node], new Map());
    expect(items.map(item => item.entry.kind)).toEqual(["assistant", "thinking", "tool-call"]);
    const total = items.reduce((sum, item) => sum + item.entry.estimatedTokens, 0);
    expect(total).toBe((1 + BLOCK_OVERHEAD) * 2 + (1 + 1 + BLOCK_OVERHEAD) + MESSAGE_OVERHEAD);
    expect(estimateConversationNode(node)).toBe(total);
  });

  it("keys compaction summaries by compaction id", () => {
    const keys = contextSummaryKeys({ summaryIds: ["old"], summaries: [{ messageId: "m", compactionId: "c1" }] });
    const items = describeConversationEntries([{ kind: "user", messageId: "m", content: "sum" }, { kind: "user", messageId: "old", content: "x" }, { kind: "user", messageId: "u", content: "hi" }], keys);
    expect(items.map(item => [item.entry.key, item.entry.bucket])).toEqual([
      [contextEntryKey("summary", "c1"), "summarizedConversation"],
      [contextEntryKey("summary", "old"), "summarizedConversation"],
      [contextEntryKey("message", "u"), "conversation"],
    ]);
    expect(sumContextBuckets(items.map(item => item.entry)).conversation).toBe(1 + BLOCK_OVERHEAD + MESSAGE_OVERHEAD);
  });

  it("renders the system prompt with runtime facts last", () => {
    expect(renderSystemPrompt([" a ", { b: 1 }, ""], [{ c: 2 }])).toBe('a\n\n{"b":1}\n\n<runtime_facts>\n[{"c":2}]\n</runtime_facts>');
  });
});

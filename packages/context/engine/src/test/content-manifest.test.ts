import { describe, it, expect } from "vitest";
import { ContextEngine } from "../engine.js";
import { describeContextContent, requestContentManifest } from "../content-manifest.js";
import { snapshotContext } from "../request-snapshot.js";
import type { Context } from "../types.js";
const context: Context = { request: { sessionId: "s", requestId: "r", routeId: "p", model: "m", options: {} }, content: { system: { sections: [{ id: "rules", owner: "rules", order: 1, content: "x".repeat(4000) }], modelFacts: [] }, tools: [], supplements: [], conversation: { replaceGeneration: 0, entries: [{ node: { kind: "user", messageId: "u", content: "hello" }, sourceEventSeqs: [1] }, { node: { kind: "assistant", messageId: "a", content: [{ type: "reasoning", text: "thought" }, { type: "tool-call", callId: "c", name: "read", arguments: {} }] }, sourceEventSeqs: [2] }] } }, status: { throughJournalSeq: 2, cycle: 0, paths: [], facts: [], plugins: {} } };
describe("Context content manifest", () => {
  it("keeps source keys across revisions and estimates before preview clipping", () => {
    const first = describeContextContent(context).manifest;
    const next = describeContextContent({ ...context, status: { ...context.status, contextRevision: 20 } }).manifest;
    expect(first.entries.map(row => row.key)).toEqual(next.entries.map(row => row.key));
    expect(first.entries[0]).toMatchObject({ estimatedTokens: 1000 });
    expect(first.entries[0]!.preview).toHaveLength(600);
    expect(first.entries.filter(row => row.bucket === "conversation").every(row => !row.preview)).toBe(true);
    expect(first.entries.find(row => row.kind === "thinking")?.trajectoryRef).toEqual({ messageId: "a" });
  });
  it("records actual repaired input and rejects provenance after an adapter rewrite", async () => {
    const engine = new ContextEngine({ resolve: () => context });
    const input = await engine.toLlmInput(context);
    const manifest = requestContentManifest(context, input, input);
    expect(manifest.comparable).toBe(true);
    expect(manifest.entries.some(row => row.kind === "tool-result" && row.trajectoryRef?.callId === "c")).toBe(true);
    expect(manifest.entries.every(row => !row.preview)).toBe(true);
    const changed = requestContentManifest(context, { ...input, messages: [{ role: "user", content: "rewritten" }] }, input);
    expect(changed.comparable).toBe(false); expect(changed.entries).toEqual([]);
    const snapshot = snapshotContext(context, input, {}, "composition", "host", input) as Record<string, unknown>;
    expect(Object.isFrozen(snapshot.contextManifest)).toBe(true);
    expect(JSON.stringify(snapshot.contextManifest)).not.toContain("thought");
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

import { expect, it, vi } from "vitest";
import { ContextSourceRegistry, type Context } from "@actspace/context-engine";
import { createCoreContributors, emptyRuntimePromptSource } from "@actspace/prompt";
import type { SourceOptions } from "@actspace/prompt/source-support";
import { createRulesSource } from "../source.js";

it("keeps per-Turn rules stable across Steps and reloads them in the next Turn", async () => {
  let text = "original rules";
  const resolveForTurn = vi.fn(async () => ({ ...emptyRuntimePromptSource(), instructions: [{ id: "host/workspace-instructions", title: "Rules", path: "/workspace/AGENTS.md", content: text, contentDigest: text }] }));
  const options = { scopeId: "scope", workspaceRoot: "/workspace", agent: {}, host: { capabilityCeiling: [] },
    prompt: { resolveForTurn, createCoreContributors } } as unknown as SourceOptions;
  const registry = new ContextSourceRegistry(); registry.register(createRulesSource(options));
  const context: Context = { request: { sessionId: "s", turnId: "t1", requestId: "r1", routeId: "route", model: "model", options: {} },
    content: { system: { sections: [], modelFacts: [] }, conversation: { entries: [], replaceGeneration: 0 }, supplements: [], tools: [] },
    status: { throughJournalSeq: 1, cycle: 0, paths: [], facts: [], plugins: {} } };
  const first = await registry.apply(context); text = "updated rules";
  const nextStep = await registry.apply({ ...context, request: { ...context.request, requestId: "r2", stepId: "step2" }, status: { ...context.status, throughJournalSeq: 20 } });
  expect(resolveForTurn).toHaveBeenCalledTimes(1);
  expect(nextStep.content.system.sections[0]).toBe(first.content.system.sections[0]);
  expect(JSON.stringify(nextStep.content.system)).toContain("original rules");
  const nextTurn = await registry.apply({ ...context, request: { ...context.request, turnId: "t2" } });
  expect(resolveForTurn).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(nextTurn.content.system)).toContain("updated rules");
});

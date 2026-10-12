import { describe, expect, it } from "vitest";
import { ContextEngine } from "../engine.js";
import { ContextReducerRegistry } from "../reducers.js";
import type { Context, ContextRequest } from "../types.js";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";

const request: ContextRequest = { sessionId: "s", logicalAgentScopeId: "agent", requestId: "r", routeId: "route", model: "model", options: {} };
function baseContext(input: ContextRequest): Context {
  return { request: input, content: { system: { sections: [], modelFacts: [] }, conversation: { replaceGeneration: 0, entries: [] }, supplements: [], tools: [] }, status: { throughJournalSeq: -1, cycle: 0, paths: [], facts: [], plugins: {} } };
}
function event(seq: number): SessionEventEnvelopeV1 {
  return { recordKind: "event", seq, type: "tool/result", eventVersion: 1, criticality: "required", time: "2026-10-11T00:00:00Z", source: { ownerPluginId: "@actspace/core" }, data: { callId: `call-${seq}` }, surface: null, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } };
}

describe("Context reducers and durable reconciliation", () => {
  it("replays each event once after the durable checkpoint", async () => {
    let durableSeq = -1;
    const session = { header: { sessionId: "s" }, lastSeq: 0, get durableSeq() { return durableSeq; }, journal: { events: [event(0)], surface: { replaceGeneration: 0, entries: [] } }, append: async () => event(1), flush: async () => undefined };
    const reducers = new ContextReducerRegistry();
    let reductions = 0;
    reducers.register({ id: "tools", owner: "tools", fields: ["status"], criticality: "required", reduce: ({ context }) => { reductions += 1; return { status: { facts: [...context.status.facts, { reduction: reductions }] } }; } });
    const engine = new ContextEngine({ session, reducers, resolve: input => baseContext(input) });

    await expect(engine.reconcile(request, 0)).rejects.toThrow("durable Journal checkpoint");
    durableSeq = 0;
    const first = await engine.reconcile(request, 0);
    const second = await engine.reconcile({ ...request, requestId: "r2", stepId: "step-2" }, 0);

    expect(reductions).toBe(1);
    expect(first.status.facts).toEqual([{ reduction: 1 }]);
    expect(second.status.contextRevision).toBe(first.status.contextRevision);
  });

  it("rejects a reducer update outside its declared ownership", async () => {
    const reducers = new ContextReducerRegistry();
    reducers.register({ id: "runtime", owner: "runtime", fields: ["status"], criticality: "required", reduce: () => ({ content: { tools: [] } }) });
    await expect(reducers.apply(baseContext(request), event(0))).rejects.toThrow("does not own tools");
  });
});

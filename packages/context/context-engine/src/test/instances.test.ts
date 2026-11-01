import { describe, expect, it } from "vitest";
import { ContextEngine } from "../engine.js";
import { ContextInstanceRegistry } from "../instances.js";
import type { Context, ContextRequest } from "../types.js";

function request(overrides: Partial<ContextRequest> = {}): ContextRequest {
  return { sessionId: "session-a", logicalAgentScopeId: "agent-main", requestId: "request-1", routeId: "route", model: "model-a", options: {}, ...overrides };
}

function context(input: ContextRequest, text = "hello"): Context {
  return {
    request: input,
    content: {
      system: { sections: [], modelFacts: [] },
      conversation: { replaceGeneration: 0, entries: [{ node: { kind: "user", messageId: "u", content: text }, sourceEventSeqs: [1] }] },
      supplements: [],
      tools: [],
    },
    status: { throughJournalSeq: 1, cycle: 0, paths: [], facts: [], plugins: {} },
  };
}

describe("ContextInstanceRegistry", () => {
  it("reuses one logical Context across per-step engine facades", async () => {
    const instances = new ContextInstanceRegistry();
    const first = new ContextEngine({ instances, resolve: input => context(input) });
    const second = new ContextEngine({ instances, resolve: input => context(input) });

    const initial = await first.getContext(request({ requestId: "request-1", stepId: "step-1" }));
    const next = await second.getContext(request({ requestId: "request-2", stepId: "step-2", model: "model-b" }));

    expect(initial.status.contextRevision).toBe(1);
    expect(next.status.contextRevision).toBe(1);
    expect(next.request.requestId).toBe("request-2");
    expect(next.request.model).toBe("model-b");
    expect(instances.size).toBe(1);
    expect(second.getInstance(request())).toMatchObject({ revision: 1, identity: { sessionId: "session-a", logicalAgentScopeId: "agent-main" } });
    const projection = second.getProjection(request({ requestId: "request-2", model: "model-b" }), "request");
    expect(projection).toMatchObject({ basis: "request", contextRevision: 1, identity: { logicalAgentScopeId: "agent-main" }, request: { requestId: "request-2", model: "model-b" } });
    expect(Object.isFrozen(projection)).toBe(true);
  });

  it("increments only the affected logical instance and protects active bindings", () => {
    const instances = new ContextInstanceRegistry();
    const base = context(request());
    const changed = context(request({ requestId: "ignored" }), "changed");
    instances.acquire(base);
    instances.acquire(changed);
    instances.acquire(context(request({ sessionId: "session-b" })));

    expect(instances.get("session-a", "agent-main")?.revision).toBe(2);
    expect(instances.get("session-b", "agent-main")?.revision).toBe(1);
    instances.bind("session-a", "agent-main");
    expect(() => instances.evict("session-a", "agent-main")).toThrow("active bindings");
    expect(instances.release("session-a", "agent-main")?.activeBindings).toBe(0);
    expect(instances.evict("session-a", "agent-main")).toBe(true);
  });

  it("does not let a stale Journal watermark overwrite a newer state", () => {
    const instances = new ContextInstanceRegistry();
    instances.acquire({ ...context(request()), status: { ...context(request()).status, throughJournalSeq: 4 } });
    const stale = instances.acquire({ ...context(request({ requestId: "late" }), "stale"), status: { ...context(request()).status, throughJournalSeq: 2 } });
    expect(stale.content.conversation.entries[0]?.node.content).toBe("hello");
    expect(stale.status.throughJournalSeq).toBe(4);
    expect(stale.request.requestId).toBe("late");
  });

  it("publishes a new revision only after the next assembled state changes", async () => {
    let text = "before";
    const instances = new ContextInstanceRegistry();
    const engine = new ContextEngine({ instances, resolve: input => context(input, text) });
    const first = await engine.getContext(request({ requestId: "first" }));
    text = "after durable session append";
    const second = await engine.getContext(request({ requestId: "second", stepId: "step-2" }));
    expect(first.content.conversation.entries[0]?.node.content).toBe("before");
    expect(second.content.conversation.entries[0]?.node.content).toBe("after durable session append");
    expect(second.status.contextRevision).toBe(2);
  });
});

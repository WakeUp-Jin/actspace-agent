import { describe, expect, it } from "vitest";
import { ContextSourceRegistry } from "@actspace/context-engine";
import { EMPTY_LLM_USAGE, type LlmMessage, type LlmRouteRegistrationHandle, type LlmRouteRegistry, type LlmStreamEvent, type LlmToolDefinition } from "@actspace/llm-service";
import { runToolStreamFixture } from "../testing.js";

type RequestPlan = { readonly attempt: number; readonly routeId: string; readonly model: string; readonly messages: readonly LlmMessage[]; readonly tools: readonly LlmToolDefinition[] };

describe("a retried request", () => {
  const retryPolicy = { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0, shouldRetry: () => true };
  const timeout: LlmStreamEvent = { type: "error", failure: { kind: "timeout", message: "timeout", retryable: true, attempt: 1 } };
  const done: LlmStreamEvent = { type: "done", stopReason: "stop", usage: EMPTY_LLM_USAGE, content: [{ type: "text", text: "Done" }] };
  const failOnce = () => {
    let attempt = 0;
    return async function* (): AsyncGenerator<LlmStreamEvent> { yield attempt++ === 0 ? timeout : done; };
  };
  const intervene = (edit: (plan: RequestPlan) => Partial<RequestPlan>) => ({
    get: () => ({ flush: async () => {} }),
    waterfall: async (type: string, _payload: unknown, next: unknown) => {
      const result = await (next as () => Promise<RequestPlan>)();
      return type === "agent/request" ? { ...result, ...edit(result) } : result;
    },
  }) as never;

  it("goes through agent/request again, so the hook's messages and tools reach every attempt", async () => {
    const attempts: number[] = [];
    const sent: { messages: readonly LlmMessage[]; tools: string[] }[] = [];
    let tools: string[] = [];
    await runToolStreamFixture({ stream: failOnce(), retryPolicy,
      onTools: value => { tools = value.map(tool => tool.name); },
      onMessages: messages => { sent.push({ messages, tools }); },
      context: intervene(({ attempt, messages, tools }) => {
        attempts.push(attempt);
        return { messages: [...messages, { role: "user", content: `hook on attempt ${attempt}` }], tools: attempt === 1 ? tools : [] };
      }),
    });
    expect(attempts).toEqual([1, 2]);
    expect(sent).toEqual([
      { messages: [{ role: "user", content: "Read fixture" }, { role: "user", content: "hook on attempt 1" }], tools: ["read_file"] },
      { messages: [{ role: "user", content: "Read fixture" }, { role: "user", content: "hook on attempt 2" }], tools: [] },
    ]);
  });

  it("keeps the route and model its step started with, whatever the hook returns", async () => {
    const sources = new ContextSourceRegistry();
    sources.register({ id: "model", owner: "model", order: 0, fields: ["system"], criticality: "required", get: (context, write) => write({ system: { sections: [{ id: "model", owner: "model", order: 0, content: `Prompt for ${context.request.model}` }], modelFacts: [] } }) });
    const offered: Pick<RequestPlan, "routeId" | "model">[] = [];
    const prompts: unknown[] = [];
    const run = await runToolStreamFixture({ stream: failOnce(), retryPolicy, contextSources: sources,
      onMessages: messages => { prompts.push(messages[0]?.content); },
      context: intervene(({ attempt, routeId, model }) => {
        offered.push({ routeId, model });
        return attempt === 1 ? { model: "first-model" } : { routeId: "other-route", model: "other-model" };
      }),
    });
    expect(offered).toEqual([{ routeId: "test", model: "test" }, { routeId: "test", model: "first-model" }]);
    expect(prompts).toEqual(["Prompt for first-model", "Prompt for first-model"]);
    const headers = run.journal.filter(event => event.type === "request/header").map(event => event.data);
    expect(headers).toMatchObject([{ attempt: 1, routeId: "test", model: "first-model" }, { attempt: 2, routeId: "test", model: "first-model" }]);
  });

  it("stays on the registration its step started with after the route is replaced", async () => {
    let routes!: LlmRouteRegistry;
    let original!: LlmRouteRegistrationHandle;
    let replacement: LlmRouteRegistrationHandle | undefined;
    let replacementDispatches = 0;
    let attempt = 0;
    try {
      const run = await runToolStreamFixture({ retryPolicy,
        onRoute: (registry, handle) => { routes = registry; original = handle; },
        stream: async function* () {
          if (attempt++ > 0) { yield done; return; }
          // 第一次尝试还在进行，连接设置变了：原来的路由开始排空，同名的新路由顶上。
          original.beginDrain();
          replacement = routes.register({ routeId: "test", providerId: "test", modelPattern: "*", credentialRef: "test", defaults: {}, adapter: {
            adapterVersion: "replacement", dispatch: async () => { replacementDispatches += 1; return (async function* (): AsyncGenerator<LlmStreamEvent> { yield done; })(); },
          } });
          yield timeout;
        },
      });
      expect(attempt).toBe(2);
      expect(replacementDispatches).toBe(0);
      const prepared = run.journal.filter(event => event.type === "request/context").map(event => (event.data as { snapshot: { prepared: { adapterVersion: string } } }).snapshot.prepared.adapterVersion);
      expect(prepared).toEqual(["test", "test"]);
    } finally { await replacement?.dispose(100); }
  });
});

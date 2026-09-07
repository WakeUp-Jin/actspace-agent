// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type { ModelCapabilities } from "@actspace/shared";
import type { LlmAdapterDispatchInput } from "@actspace/llm-service";
import { DesktopLegacyLlmAdapter } from "../runtime-v2/legacy-llm-adapter";
const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn(async () => (async function* () {})()) }));
vi.mock("@actspace/llm-pi-ai", () => ({ PiAiAdapter: class { dispatch = dispatch; }, PiAiWireEngine: class {}, LegacyProxyWireEngine: class {} }));
beforeEach(() => dispatch.mockClear());
it("freezes pricing against the credential endpoint and final reasoning model", async () => {
  const resolution = { ok: true as const, model: { key: "fixture", definition: { api: "openai-completions" as const, provider: "deepseek", apiModel: "base", contextWindow: 1000, requestModelByReasoningEffort: { high: "actual-high" } }, providerRuntime: { baseUrl: "https://api.deepseek.com" } } };
  const resolvePricing = vi.fn(() => null);
  const adapter = new DesktopLegacyLlmAdapter({ resolvePricing, resolveMainModel: () => resolution, resolveImageInspectionModel: () => resolution, getToolEnvironment: () => ({ searchCredentials: {} }) }, async () => { throw Error("unused"); });
  try {
    await adapter.dispatch({ request: { model: "fixture", options: { reasoning: true, reasoningEffort: "high" } }, credential: { baseUrl: "https://custom.example/v1" }, signal: new AbortController().signal } as unknown as LlmAdapterDispatchInput);
    expect(resolvePricing).toHaveBeenCalledWith(expect.objectContaining({ providerRuntime: expect.objectContaining({ baseUrl: "https://custom.example/v1" }) }), "actual-high");
  } finally { await adapter.dispose(); }
});
it.each([
  { capabilities: { reasoning: true, thinkingToggle: true }, requested: { reasoning: false }, expected: { reasoning: false } },
  { capabilities: { reasoning: true, thinkingToggle: false, reasoningMandatory: true }, requested: { reasoning: false }, expected: { reasoning: true } },
  { capabilities: { reasoning: true, thinkingToggle: true, reasoningEfforts: ["high", "max"], reasoningDefaultEffort: "high" }, requested: { reasoning: true, reasoningEffort: "max" }, expected: { reasoning: true, reasoningEffort: "max" } },
  { capabilities: { reasoning: false, thinkingToggle: false }, requested: { reasoning: true, reasoningEffort: "max" }, expected: {} },
])("normalizes request options using model capabilities: $expected", async ({ capabilities, requested, expected }) => {
  const resolution = { ok: true as const, model: { key: "fixture", definition: { api: "openai-completions" as const, provider: "deepseek", apiModel: "v4", contextWindow: 1000, thinkingDefault: true, capabilities: capabilities as ModelCapabilities }, providerRuntime: {} } };
  const adapter = new DesktopLegacyLlmAdapter({ resolveMainModel: () => resolution, resolveImageInspectionModel: () => resolution, getToolEnvironment: () => ({ searchCredentials: {} }) }, async () => { throw Error("unused"); });
  try {
    await adapter.dispatch({ request: { model: "fixture", options: requested }, credential: {}, signal: new AbortController().signal } as unknown as LlmAdapterDispatchInput);
    expect((dispatch.mock.calls[0] as unknown as [LlmAdapterDispatchInput])[0].request.options).toMatchObject(expected);
    if (!capabilities.reasoning) expect((dispatch.mock.calls[0] as unknown as [LlmAdapterDispatchInput])[0].request.options).not.toHaveProperty("reasoning");
  } finally { await adapter.dispose(); }
});

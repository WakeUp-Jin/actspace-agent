import { expect, it, vi } from "vitest";
import { HostModelRouter } from "../node-ports/model-router.js";
import { NodeLlmAdapter } from "../node-ports/llm-adapter.js";
import type { HostConfig } from "../config.js";
it("selects model-specific credentials for each request without sharing provider keys", async () => {
  const seen: unknown[] = [];
  const prepare = vi.spyOn(NodeLlmAdapter.prototype, "prepare").mockImplementation(input => ({ request: input.request, dispatch: async input => { seen.push(input.credential); return (async function* () {})(); } }));
  const config = { defaultModel: "a/m", providers: [{ id: "a", type: "openai-completions", baseUrl: "https://a.example", keyEnv: "A", models: ["m"] }, { id: "b", type: "openai-completions", baseUrl: "https://b.example", keyEnv: "B", models: ["n"] }] } as HostConfig;
  const router = new HostModelRouter(config, { env: { A: "key-a", B: "key-b" }, readArtifact: async () => { throw new Error("unused"); } });
  try {
    await router.dispatch({ request: { model: "b/n" }, signal: new AbortController().signal, credential: { apiKey: "wrong" } } as never);
    await router.dispatch({ request: { model: "a/m" }, signal: new AbortController().signal, credential: { apiKey: "wrong" } } as never);
    expect(seen).toEqual([{ apiKey: "key-b", baseUrl: "https://b.example" }, { apiKey: "key-a", baseUrl: "https://a.example" }]);
    expect(() => router.prepare({ request: { model: "unknown" } } as never)).toThrow("not published");
  } finally { prepare.mockRestore(); await router.dispose(); }
});

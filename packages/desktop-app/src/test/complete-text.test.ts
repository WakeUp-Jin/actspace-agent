import { expect, it } from "vitest";
import { EMPTY_LLM_USAGE, LlmRouteRegistry, LlmService } from "@actspace/llm-service";
import { completeText } from "../complete-text.js";

it("keeps chat completions on default when auxiliary routes sort first", async () => {
  const routes = new LlmRouteRegistry();
  const handles = ["default", "auto-review", "utility"].map(routeId => routes.register({
    routeId, providerId: "fixture", modelPattern: "*", credentialRef: "fixture", defaults: {},
    adapter: { adapterVersion: "fixture", dispatch: async () => (async function* () {
      yield { type: "done" as const, stopReason: "stop", usage: EMPTY_LLM_USAGE, content: [{ type: "text" as const, text: routeId }] };
    })() },
  }));
  const llm = new LlmService(routes, { resolve: async () => ({}) });
  try {
    expect((await completeText(llm, { messages: [] })).text).toBe("default");
    expect((await completeText(llm, { messages: [], purpose: "utility" })).text).toBe("utility");
  } finally { for (const handle of handles) await handle.dispose(); }
});

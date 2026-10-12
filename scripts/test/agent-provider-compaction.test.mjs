import test from "node:test";
import assert from "node:assert/strict";
import { startAgentProvider } from "./fixtures/agent-provider.mjs";
import { COMPACTION_SYSTEM } from "../../packages/context/compaction/dist/prompts.js";

test("fixture compaction failure and recovery follow the actual compaction prompt", async () => {
  const provider = await startAgentProvider();
  try {
    const request = (system, tools = []) => fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "fixture-main", stream: false, tools,
        messages: [{ role: "system", content: system }, { role: "user", content: "Summarize this history." }] }),
    });
    provider.control("summary-error");
    assert.equal((await request(COMPACTION_SYSTEM)).status, 400);
    assert.equal(provider.requests.at(-1).isSummary, true);
    assert.equal((await request("Regular assistant")).status, 200);
    assert.equal(provider.requests.at(-1).isSummary, false);
    provider.control("summary-ok");
    const recovered = await request(COMPACTION_SYSTEM);
    assert.equal(recovered.status, 200);
    assert.match((await recovered.json()).choices[0].message.content, /Fixture summary/);
  } finally { await provider.close(); }
});

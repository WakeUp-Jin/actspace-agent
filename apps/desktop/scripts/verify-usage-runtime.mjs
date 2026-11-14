import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { SessionStore } from "../../../packages/session/session-persistence/dist/index.js";
import { JsonlSessionStorage } from "../../../packages/session/session-persistence-jsonl/dist/index.js";
const require = createRequire(import.meta.url);
const { resolveModelPricing } = require("@actspace/shared");
const { BUILTIN_MODEL_CATALOG } = require("@actspace/shared/model-catalog-data");
const { calculateUsageCost } = await import("@actspace/llm-service");
const dataRoot = await mkdtemp(join(tmpdir(), "actspace-usage-verification-"));
const registry = createCoreCodecRegistry();
const storage = new JsonlSessionStorage({ dataRoot, runtimeId: "usage-verification", registry });
const store = new SessionStore({ registry }, storage);
const sessionId = "usage-verification";
const session = await store.create({
  sessionId,
  createdAt: new Date().toISOString(),
  cwd: resolve(import.meta.dirname, ".."),
  lineage: null,
  createdWith: {
    profileId: "base",
    runtimeContractVersion: "actspace.runtime.v2",
    manifestDigest: "verification",
    plugins: [{ id: "@actspace/core", version: "2.0.0" }],
    codecSetDigest: registry.digest,
  },
});
const append = (type, data) =>
  session.append({ type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null });
await append("session/title-set", { title: "使用统计验收样例" });
for (let i = 0; i < 15; i++) {
  const ids = { turnId: `t${i}`, stepId: `s${i}`, requestId: `r${i}` };
  await append("turn/start", ids);
  await append("step/start", ids);
  await append("request/header", { ...ids, model: "deepseek-v4-flash", routeId: "deepseek" });
  await append("request/context", { ...ids, snapshot: { schemaVersion: 3, requestOptions: {} } });
  const pricing = resolveModelPricing(BUILTIN_MODEL_CATALOG, {
    apiModel: "deepseek-v4-flash",
    modelKey: "deepseek:deepseek-v4-flash",
    providerId: "deepseek",
    baseUrl: "https://api.deepseek.com",
  });
  const usage =
    i === 0
      ? { inputTokens: 100, outputTokens: 20, cost: 0, costCurrency: "USD", source: "provider-reported" }
      : calculateUsageCost(
          {
            inputTokens: 769,
            outputTokens: 145,
            cacheReadTokens: 36736,
            cacheWriteTokens: 0,
            reasoningTokens: null,
            cost: null,
            costCurrency: null,
            source: "provider-reported",
          },
          pricing,
        );
  await append("assistant/message", { ...ids, messageId: `a${i}`, content: [], finishReason: "stop", usage });
  await append("step/end", { ...ids, reason: "completed", usage });
  await append("turn/end", { turnId: ids.turnId, reason: "completed" });
}
await session.close();
const inspection = await store.inspect(sessionId);
assert.equal(inspection.events.filter((event) => event.type === "assistant/message").length, 15);
const recorded = inspection.events.filter(
  (event) => event.type === "assistant/message" && event.data.usage.costProvenance,
);
assert.equal(recorded.length, 14);
assert.ok(
  recorded.every((event) => event.data.usage.cost > 0 && event.data.usage.costProvenance.basis === "estimated"),
);

console.log(
  JSON.stringify({ dataRoot, sessionId, checks: ["real Journal with 15 requests", "no real provider charge"] }),
);

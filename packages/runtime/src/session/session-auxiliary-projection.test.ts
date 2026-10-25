import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCoreCodecRegistry, type SessionEventCandidateV1 } from "@actspace/session-journal";
import { JsonlSessionStorage } from "@actspace/session-jsonl";
import { SessionStore } from "@actspace/session-persistence";
import { RuntimeSessionController } from "./session-controller.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "auxiliary-projection-")); roots.push(root);
  const registry = createCoreCodecRegistry();
  const controller = () => new RuntimeSessionController({ dataRoot: root, registry, runtimeId: "test", profileId: "test", manifestDigest: "test", plugins: [] }, new SessionStore({ registry }, new JsonlSessionStorage({ dataRoot: root, registry, runtimeId: "test" })));
  const writer = controller();
  const session = await writer.create("s", "/workspace", "agent");
  const append = (type: string, data: SessionEventCandidateV1["data"]) => session.append({ type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null });
  const auxiliary = { sessionId: "s", agentRunId: "run", turnId: "t", stepId: "step", callId: "image", logicalRequestId: "vision", attemptId: "vision-1", attempt: 1, purpose: "image-inspection", routeId: "vision-route", model: "vision-model", startedAt: "2026-10-23T00:00:01.000Z" };
  const usage = { inputTokens: 90, outputTokens: 10, cacheReadTokens: 20, cacheWriteTokens: 0, reasoningTokens: null, cost: null, costCurrency: null, source: "provider-reported" };
  async function imageTurn(output = "done") {
    await append("turn/start", { turnId: "t", agentRunId: "run" });
    await append("step/start", { turnId: "t", stepId: "step" });
    await append("request/header", { turnId: "t", stepId: "step", requestId: "main" });
    await append("request/context", { turnId: "t", stepId: "step", requestId: "main", snapshot: {} });
    await append("assistant/message", { turnId: "t", stepId: "step", requestId: "main", messageId: "assistant", content: "Inspect image", finishReason: "tool-calls" });
    await append("tool/call", { callId: "image", name: "inspect_image" });
    await append("llm/auxiliary-start", auxiliary);
    await append("llm/auxiliary-end", { ...auxiliary, finishedAt: "2026-10-23T00:00:02.000Z", status: "completed", usage });
    await append("tool/result", { callId: "image", name: "inspect_image", status: "completed", summary: "Image inspected", modelOutput: [{ type: "text", text: output }] });
    await append("step/end", { turnId: "t", stepId: "step", stopReason: "completed", usage: null });
    await append("turn/end", { turnId: "t" });
    await session.flush();
  }
  return { controller, writer, session, append, auxiliary, usage, imageTurn };
}

describe("auxiliary requests through production history windows", () => {
  it("counts auxiliary requests in page offsets both live and after JSONL reopen", async () => {
    const f = await fixture();
    await f.imageTurn();
    for (let i = 1; i <= 20; i++) {
      await f.append("turn/start", { turnId: `t${i}` });
      await f.append("turn/end", { turnId: `t${i}` });
    }
    await f.session.flush();
    const live = await f.writer.readProjection({ sessionId: "s" });
    expect(live.window.turnOffset).toBe(1);
    expect(live.window.requestOffset).toBe(2);
    await f.writer.closeAll();
    const cold = await f.controller().readProjection({ sessionId: "s" });
    expect(cold.window.requestOffset).toBe(2);
    const older = await f.controller().readProjection({ sessionId: "s", beforeSeq: cold.window.beforeSeq! });
    expect(older.window.requestOffset).toBe(0);
    expect(older.window.events.filter(event => event.type === "llm/auxiliary-start")).toHaveLength(1);
  });

  it("defers a large parent tool result without stripping auxiliary identity, terminal state or usage", async () => {
    const f = await fixture();
    const output = "private tool output".repeat(2_000);
    await f.imageTurn(output);
    const check = async (controller: RuntimeSessionController) => {
      const page = await controller.readProjection({ sessionId: "s" });
      expect(page.deferredToolCalls).toEqual(["image"]);
      expect(page.window.events.find(event => event.type === "llm/auxiliary-start")?.data).toEqual(f.auxiliary);
      expect(page.window.events.find(event => event.type === "llm/auxiliary-end")?.data).toEqual({ ...f.auxiliary, finishedAt: "2026-10-23T00:00:02.000Z", status: "completed", usage: f.usage });
      expect(JSON.stringify(page.window)).not.toContain(output);
      expect(JSON.stringify(await controller.browseToolDetail("s", "image"))).toContain(output);
    };
    await check(f.writer);
    await f.writer.closeAll();
    await check(f.controller());
  });
});

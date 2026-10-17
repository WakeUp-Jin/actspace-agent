import { expect, it } from "vitest";
import { SessionJournal, createCoreCodecRegistry, type SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { LlmStreamEvent } from "@actspace/llm-service";
import { runToolStreamFixture } from "../testing.js";

it.each(["error", "aborted", "throw"] as const)("preserves partial text and identity after %s, without executing partial tools", async (ending) => {
  let journal: readonly SessionEventEnvelopeV1[] = [];
  let executed = 0;
  await expect(runToolStreamFixture({
    stream: async function* (): AsyncGenerator<LlmStreamEvent> {
      yield { type: "text-delta", text: "Keep this answer." };
      yield { type: "tool-call-delta", callId: "partial", name: "read_file", argumentsDelta: '{"path":' };
      if (ending === "throw") throw new Error("Stream disconnected");
      if (ending === "aborted") yield { type: "aborted", reason: "Stopped" };
      else yield { type: "error", failure: { kind: "unknown", message: "Failed", retryable: false, attempt: 1 } };
    },
    execute: async () => { executed++; throw new Error("must not run"); },
    onJournal: events => { journal = events; },
  })).rejects.toThrow();
  const message = journal.find(event => event.type === "assistant/message")!;
  const chunk = journal.find(event => event.type === "assistant/chunk")!;
  expect(message.data).toMatchObject({ messageId: (chunk.data as { messageId: string }).messageId, content: [{ type: "text", text: "Keep this answer." }], finishReason: ending === "aborted" ? "aborted" : "failed" });
  expect(message.surface).toMatchObject({ kind: "append", node: { kind: "assistant", content: [{ type: "text", text: "Keep this answer." }] } });
  expect(journal.filter(event => event.type === "assistant/message")).toHaveLength(1);
  expect(executed).toBe(0);
  const replay = new SessionJournal({ registry: createCoreCodecRegistry(), seed: journal });
  expect(replay.surface.entries.some(entry => JSON.stringify(entry.node.content).includes("Keep this answer."))).toBe(true);
});


it("keeps partial text when an aborted iterator ends without another event", async () => {
  let abort = () => {};
  const { journal, result } = await runToolStreamFixture({
    onLoop: loop => { abort = () => { loop.abort("user"); }; },
    stream: async function* (): AsyncGenerator<LlmStreamEvent> {
      yield { type: "text-delta", text: "Before stop." };
      abort();
    },
  });
  expect(result.reason).toBe("aborted");
  expect(journal.find(event => event.type === "assistant/message")?.data).toMatchObject({ content: [{ type: "text", text: "Before stop." }], finishReason: "aborted" });
});

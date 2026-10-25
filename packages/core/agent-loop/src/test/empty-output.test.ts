import { expect, it } from "vitest";
import { SessionJournal, assertSessionCanClose, createCoreCodecRegistry } from "@actspace/session-journal";
import { EMPTY_LLM_USAGE, type LlmStreamEvent } from "@actspace/llm-service";
import { runToolStreamFixture } from "../testing.js";

it.each([
  { kind: "main", subagent: false },
  { kind: "subagent", subagent: true },
])("settles an empty successful $kind response and remains writable for a followup", async ({ subagent }) => {
  const usage = { ...EMPTY_LLM_USAGE, inputTokens: 100, outputTokens: 0, source: "provider-reported" as const };
  let requests = 0;
  const { result, journal } = await runToolStreamFixture({
    subagent,
    followup: true,
    stream: async function* (): AsyncGenerator<LlmStreamEvent> {
      requests++;
      yield { type: "done", stopReason: "stop", usage,
        content: requests === 1 ? [] : [{ type: "text", text: "After empty." }] };
    },
  });
  expect(result).toMatchObject({ reason: "completed", steps: 1, finalText: "" });
  expect(requests).toBe(2);
  const headers = journal.filter(event => event.type === "request/header");
  const messages = journal.filter(event => event.type === "assistant/message");
  expect(headers).toHaveLength(2);
  expect(messages).toHaveLength(2);
  expect(messages[0]!.data).toMatchObject({
    requestId: (headers[0]!.data as { requestId: string }).requestId,
    content: [], finishReason: "stop", usage,
  });
  expect(messages[0]!.seq).toBeLessThan(journal.find(event => event.type === "step/end")!.seq);
  expect(messages[1]!.data).toMatchObject({ content: [{ type: "text", text: "After empty." }] });
  expect(journal.filter(event => event.type === "turn/end")).toHaveLength(2);
  const replay = new SessionJournal({ registry: createCoreCodecRegistry(), seed: journal });
  expect(replay.validation.accessState).toBe("read-write");
  expect(replay.validation.relations).toMatchObject({ openTurnId: null, openStepId: null, openRequestIds: [], openToolCallIds: [] });
  expect(() => assertSessionCanClose(replay.validation)).not.toThrow();
});

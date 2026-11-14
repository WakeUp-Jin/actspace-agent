import { getEventListeners } from "node:events";
import { describe, expect, it } from "vitest";
import { EMPTY_LLM_USAGE, type LlmStreamEvent } from "@actspace/llm-service";
import { runToolStreamFixture } from "../testing.js";

describe("the turn's abort signal", () => {
  it("carries no listeners left behind by earlier steps", async () => {
    // 回合的 signal 交给这一轮的每次请求和每次工具调用。结束的请求和调用不摘监听器，
    // 监听器连同它抓住的流、请求快照、工具参数和结果就留到回合结束，步数越多占得越多。
    const steps = 4;
    let requests = 0;
    const listeners: number[] = [];
    await runToolStreamFixture({
      stream: () =>
        (async function* (): AsyncGenerator<LlmStreamEvent> {
          requests += 1;
          yield requests < steps
            ? {
                type: "done",
                stopReason: "tool-use",
                usage: EMPTY_LLM_USAGE,
                content: [
                  {
                    type: "tool-call",
                    callId: `read-${requests}`,
                    name: "read_file",
                    arguments: '{"path":"fixture.txt"}',
                  },
                ],
              }
            : { type: "done", stopReason: "stop", usage: EMPTY_LLM_USAGE, content: [{ type: "text", text: "Done" }] };
        })(),
      context: {
        get: () => ({ flush: async () => {} }),
        waterfall: async (type, payload, next) => {
          if (type === "llm/stream")
            listeners.push(getEventListeners((payload as { signal: AbortSignal }).signal, "abort").length);
          return (next as () => Promise<object>)();
        },
      },
    });
    expect(listeners).toEqual([0, 0, 0, 0]);
  });
});

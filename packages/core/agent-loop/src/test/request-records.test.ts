import { expect, it } from "vitest";
import { ContextSourceRegistry } from "@actspace/context-engine";
import { EMPTY_LLM_USAGE, type LlmStreamEvent } from "@actspace/llm-service";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { runToolStreamFixture } from "../testing.js";

const REMOVED_SNAPSHOT_FIELDS = [
  "messages",
  "tools",
  "renderedSystemPrompt",
  "systemSections",
  "contextSections",
  "modelFacts",
  "contextModelFacts",
  "facts",
  "contributorProvenance",
  "contextManifest",
];

function sources(prompt: () => string): ContextSourceRegistry {
  const registry = new ContextSourceRegistry();
  registry.register({
    id: "prompt",
    owner: "prompt",
    order: 0,
    fields: ["system"],
    criticality: "required",
    get: (_context, write) =>
      write({ system: { sections: [{ id: "prompt", owner: "prompt", order: 0, content: prompt() }], modelFacts: [] } }),
  });
  return registry;
}
const types = (journal: readonly SessionEventEnvelopeV1[]) =>
  journal.filter((event) => event.type.startsWith("request/")).map((event) => event.type);

it("writes the prompt and tools on the first request and skips them while unchanged", async () => {
  const run = await runToolStreamFixture({ contextSources: sources(() => "Stable prompt") });
  // 两个 Step：第一次请求写提示词与工具，第二次内容相同不写。
  expect(types(run.journal)).toEqual([
    "request/header",
    "request/system-prompt",
    "request/tools",
    "request/context",
    "request/header",
    "request/context",
  ]);
  const prompt = run.journal.find((event) => event.type === "request/system-prompt")!.data as any;
  const tools = run.journal.find((event) => event.type === "request/tools")!.data as any;
  expect(prompt.sections).toEqual([{ owner: "prompt", id: "prompt", order: 0, content: "Stable prompt" }]);
  expect(tools.tools.map((tool: any) => tool.name)).toEqual(["read_file"]);
  for (const event of run.journal.filter((item) => item.type === "request/context")) {
    const snapshot = (event.data as any).snapshot;
    expect(snapshot).toMatchObject({ schemaVersion: 3, systemPromptDigest: prompt.digest, toolsDigest: tools.digest });
    for (const field of REMOVED_SNAPSHOT_FIELDS) expect(snapshot[field]).toBeUndefined();
  }
});

it("writes only the changed part", async () => {
  let step = 0;
  const run = await runToolStreamFixture({ contextSources: sources(() => `Prompt ${step++ === 0 ? "a" : "b"}`) });
  // 第二次请求提示词变了、工具没变：只写提示词。
  expect(types(run.journal)).toEqual([
    "request/header",
    "request/system-prompt",
    "request/tools",
    "request/context",
    "request/header",
    "request/system-prompt",
    "request/context",
  ]);
});

it("writes only the tools when the tool list changes", async () => {
  let step = 0;
  const registry = sources(() => "Stable prompt");
  // 第二次请求时工具描述变了。
  registry.register({
    id: "tools",
    owner: "tools",
    order: 1,
    fields: ["tools"],
    criticality: "required",
    get: (context, write) => {
      write({
        tools: [
          {
            name: "read_file",
            definitionVersion: 1,
            definitionDigest: "d",
            description: `Read fixture ${step++}`,
            inputSchema: { type: "object" },
          },
        ],
      });
    },
  });
  const run = await runToolStreamFixture({ contextSources: registry });
  expect(types(run.journal)).toEqual([
    "request/header",
    "request/system-prompt",
    "request/tools",
    "request/context",
    "request/header",
    "request/tools",
    "request/context",
  ]);
  const [first, second] = run.journal
    .filter((event) => event.type === "request/tools")
    .map((event) => (event.data as any).tools[0].description);
  expect(first).toBe("Read fixture 0");
  expect(second).not.toBe(first);
});

it("does not rewrite the prompt or tools for a retry", async () => {
  let attempt = 0;
  const stream = async function* (): AsyncGenerator<LlmStreamEvent> {
    if (attempt++ === 0) {
      yield { type: "error", failure: { kind: "timeout", message: "timeout", retryable: true, attempt: 1 } };
      return;
    }
    yield { type: "text-delta", text: "Done" };
    yield { type: "done", stopReason: "stop", usage: EMPTY_LLM_USAGE, content: [{ type: "text", text: "Done" }] };
  };
  const run = await runToolStreamFixture({
    contextSources: sources(() => "Stable prompt"),
    stream,
    retryPolicy: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0, shouldRetry: () => true },
  });
  expect(types(run.journal)).toEqual([
    "request/header",
    "request/system-prompt",
    "request/tools",
    "request/context",
    "request/header",
    "request/context",
  ]);
});

it("compares with the journal, so a resumed session does not rewrite unchanged records", async () => {
  const first = await runToolStreamFixture({ contextSources: sources(() => "Stable prompt"), terminalOnly: true });
  const seeded = first.journal.filter((event) => !event.type.startsWith("session/"));
  const resumed = await runToolStreamFixture({
    contextSources: sources(() => "Stable prompt"),
    terminalOnly: true,
    seedSession: async (session) => {
      for (const event of seeded)
        await session.append({
          type: event.type,
          eventVersion: event.eventVersion,
          source: event.source,
          data: event.data,
          surface: event.surface ?? null,
        } as never);
    },
  });
  expect(types(resumed.journal.slice(seeded.length))).toEqual(["request/header", "request/context"]);
});
